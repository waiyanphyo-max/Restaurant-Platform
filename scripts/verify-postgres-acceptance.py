#!/usr/bin/env python3
"""Fail-closed CI acceptance for the existing PostgreSQL Testcontainers suite.

Only allowlisted metadata and test summaries are exported. Surefire XML can
contain environment properties and logs, so it must never be uploaded raw.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


SUITE = "com.restaurant.platform.integration.PostgresMigrationSchemaTest"
REQUIRED_CASES = {
    "featuredSelectionConstraintsAndDirectPrivilegesHold",
    "featuredConcurrentSelectionsAndRollbackUseActualDatabase",
    "shoppingSeparationCopiesLegacyPlansAndRetainsValuationAndConfirmedFinancialHistory",
    "optionalVariantDescriptionsPreserveExistingFieldsAndRoundTripUnicode",
    "missingCustomerProfileCanOnlyBeRestoredFromAnActiveAuthIdentity",
    "restaurantInboxQueriesExcludeOtherTenantsAndUsers",
    "accountingDomainsPreserveFinancialIntegrity",
    "deliveryEligibilityUsesEnabledAccountsWithinTheRestaurant",
    "orderDeliveryCoordinatesAreImmutableAndAssignedReadsAreScoped",
    "allMigrationsCreateTheExpectedSecurityAndCheckoutSchema",
    "postgresIdempotencyStoreReplaysEncryptedResponseAndRejectsChangedPayload",
    "customerDeliveryInboxAndPushRespectTenantAndOwnership",
    "notificationTriggerQueuesOneOutboxItemForEachActiveDevice",
    "platformConfigurationMigrationIsTenantScopedAndUnavailableToClientRoles",
    "runtimeBrandingIsValidatedTenantScopedAndUnavailableToDirectClients",
    "concurrentInitializationAndUpdatesCannotOverwriteNewerRuntimePalettes",
    "bootstrapReceiptsCannotBeAccessedDirectlyAndRejectInvalidRows",
    "platformBootstrapKeepsTwoSyntheticCatalogsBrandsAndOwnersSeparate",
    "bootstrapConcurrentRetriesAndTransactionRollbackAreSafe",
    "bootstrapConcurrentManifestReviewAndHistoricalReplayPreserveCurrentTenantMappings",
    "migrationDirectoryContainsTimestampOrderedSqlFiles",
    "continuousAuthenticatedTwoTenantJourneyUsesPersistedState",
    "restrictedServerPrincipalAndDirectClientBoundariesHold",
}
JOURNEY_PHASES = [
    "PLATFORM_PROVISIONING_A_B", "OWNER_AND_MANAGER_MEMBERSHIP", "RUNTIME_BRANDING",
    "CATALOG_VARIANT_REQUIRED_MODIFIER", "BOOTSTRAP_RECEIPT_RETRY_AND_CONFLICT",
    "OWNER_PASSWORD_AMR_PREREQUISITE", "OPERATIONS_HANDOFF_A_B", "OWNER_MANAGER_CATALOG_PALETTE_UPDATES",
    "PUBLIC_PERSISTED_MENU_AND_BRANDING", "OWNER_ONLY_FEATURED", "CROSS_TENANT_READ_WRITE_REFERENCE_DENIAL",
    "SIGNED_JWT_SIGNATURE_ISSUER_AUDIENCE_EXPIRY_VALIDATION",
]
JOURNEY_BOUNDARIES = ["Supabase Auth Admin exact-UUID identity lookup",
                      "Ephemeral loopback ES256 JWKS issuer and signed fresh-password AMR claim"]


def source_inventory(root):
    files = sorted((root / "supabase/migrations").glob("*.sql"))
    names = [file.name for file in files]
    if len(files) != 35 or any(not re.fullmatch(r"\d{14}_.+\.sql", name) for name in names):
        raise ValueError("Expected exactly 35 timestamp-named source SQL migrations")
    if len({name[:14] for name in names}) != 35:
        raise ValueError("Duplicate migration timestamp")
    return [{"name": file.name, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
            for file in files]


def read_suite(path):
    suite = ET.parse(path).getroot()
    if suite.tag != "testsuite" or not suite.get("name"):
        raise ValueError("Invalid Surefire testsuite")
    cases = suite.findall("testcase")
    counts = {"tests": len(cases), "failures": sum(case.find("failure") is not None for case in cases),
              "errors": sum(case.find("error") is not None for case in cases),
              "skipped": sum(case.find("skipped") is not None for case in cases)}
    if any(int(suite.get(key, "-1")) != value for key, value in counts.items()):
        raise ValueError("Surefire declared counts do not match testcases")
    summary = {"name": suite.get("name"), **counts, "executed": counts["tests"] - counts["skipped"]}
    if summary["name"] == SUITE:
        names = [case.get("name") for case in cases]
        if any(case.get("classname") != SUITE for case in cases) or len(names) != len(set(names)):
            raise ValueError("Invalid required testcase identity")
        summary["cases"] = [{"name": case.get("name"),
                             "status": "SKIPPED" if case.find("skipped") is not None else
                             "FAIL" if case.find("failure") is not None or case.find("error") is not None
                             else "PASS"} for case in cases]
    return summary


def assess(root, commit, maven_outcome="success", docker=None):
    result = {"status": "BLOCKED", "sourceCommit": commit, "mavenOutcome": maven_outcome,
              "docker": docker or {"available": None}, "reasons": [], "suites": [],
              "limitations": ["Synthetic Supabase Auth schema and signed identities; no hosted/provider acceptance",
                              "Local restricted principal fixtures do not certify deployed database roles"]}
    reasons = result["reasons"]
    try:
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise ValueError("A full tested commit SHA is required")
        inventory = source_inventory(root)
        result["migrationInventory"] = inventory
        for path in sorted((root / "app/api/target/surefire-reports").glob("TEST-*.xml")):
            result["suites"].append(read_suite(path))
        required = [suite for suite in result["suites"] if suite["name"] == SUITE]
        totals = {key: sum(suite[key] for suite in result["suites"])
                  for key in ("tests", "executed", "failures", "errors", "skipped")}
        result["totals"] = totals
        if totals["failures"] or totals["errors"] or maven_outcome == "failure":
            result["status"] = "FAIL"
            reasons.append("Maven or an executed test failed")
        elif maven_outcome != "success":
            reasons.append("Maven verification did not complete")
        if len(required) != 1:
            reasons.append("Required PostgreSQL suite did not produce exactly one valid result")
            return result
        suite = required[0]
        if not suite["skipped"] and maven_outcome == "success":
            result["status"] = "FAIL"  # Executed results still need all acceptance evidence below.
        missing = REQUIRED_CASES - {case["name"] for case in suite["cases"]}
        if missing:
            reasons.append("Required PostgreSQL testcases are missing: " + ", ".join(sorted(missing)))
        if suite["skipped"]:
            if result["status"] != "FAIL":
                result["status"] = "BLOCKED" if docker and docker.get("available") is False else "SKIPPED"
            reasons.append("Mandatory PostgreSQL testcases were SKIPPED")
        evidence_path = root / "app/api/target/postgres-acceptance/database.json"
        if not evidence_path.exists():
            reasons.append("Database version/migration execution evidence is missing")
            return result
        database = json.loads(evidence_path.read_text(encoding="utf-8"))
        # Explicit allowlist: never copy arbitrary input, JDBC URLs, credentials, or test output.
        result["database"] = {key: database.get(key) for key in (
            "sourceCommit", "serverVersionNum", "serverVersion", "containerImage", "schemaValidated",
            "legacyShoppingSeeded", "setupStatus", "sourceTreeDirty")}
        if database.get("sourceCommit") != commit:
            reasons.append("Database execution commit does not match tested commit")
        if database.get("containerImage") != "postgres:17-alpine":
            reasons.append("Database execution did not use the required postgres:17-alpine image")
        if type(database.get("sourceTreeDirty")) is not bool:
            reasons.append("Database evidence is missing the source tree state")
        if type(database.get("serverVersionNum")) is not int or database["serverVersionNum"] < 170000:
            reasons.append("Actual PostgreSQL server is not proven to be 17+")
        expected = [{**migration, "applied": True} for migration in inventory]
        # Only known source identities/hashes can enter execution evidence.
        applied = database.get("migrations", [])
        if isinstance(applied, list):
            result["appliedMigrations"] = [
                {**migration, "applied": record.get("applied") is True}
                for migration in inventory for record in applied
                if isinstance(record, dict) and record.get("name") == migration["name"]
                and record.get("sha256") == migration["sha256"]]
        if database.get("migrations") != expected:
            reasons.append("Applied migration order/hashes do not match the exact source chain")
        if database.get("schemaValidated") is not True or database.get("legacyShoppingSeeded") is not True:
            reasons.append("Schema validation or seeded legacy-shopping upgrade did not complete")
        if database.get("setupStatus") != "PASS":
            reasons.append("Database setup executed but failed")
            result["status"] = "FAIL"
        principal_path = root / "app/api/target/postgres-acceptance/restricted-principal.json"
        if not principal_path.exists():
            reasons.append("Restricted-principal execution evidence is missing")
        else:
            principal = json.loads(principal_path.read_text(encoding="utf-8"))
            grants = {"restaurant_runtime_branding": ["SELECT", "INSERT", "UPDATE"],
                      "restaurant_bootstrap_steps": ["SELECT", "INSERT"],
                      "restaurant_featured_product": ["SELECT", "INSERT", "UPDATE"]}
            expected_principal = {
                "status": "PASS", "serverVersionNum": database.get("serverVersionNum"),
                "trustedServer": {"superuser": False, "ownsTables": False, "bypassRls": True, "grants": grants},
                "nonBypassProbe": "same object grants; RLS hides reads and denies writes",
                "clientRoles": {"anon": "DENIED", "authenticated": "DENIED", "service_role": "DENIED"},
                "foreignFeaturedReference": "DENIED:23503", "unrelatedPrivateTables": "DENIED:42501",
                "fixtureRolesAndGrantsRolledBack": True}
            if any(principal.get(key) != value for key, value in expected_principal.items()):
                reasons.append("Restricted-principal execution evidence is invalid")
            else:
                result["restrictedPrincipal"] = expected_principal
        journey_path = root / "app/api/target/postgres-acceptance/http-journey.json"
        if not journey_path.exists():
            reasons.append("Continuous HTTP journey execution evidence is missing")
        else:
            journey = json.loads(journey_path.read_text(encoding="utf-8"))
            expected_journey = {
                "schemaVersion": 1, "status": "PASS", "serverVersionNum": database.get("serverVersionNum"),
                "phases": JOURNEY_PHASES, "syntheticExternalBoundaries": JOURNEY_BOUNDARIES,
                "identityScope": "One invocation's synthetic A/B users and returned restaurant/catalog UUIDs reused across all phases",
                "invitationCount": 0, "recoveryEmailCount": 0, "cleanup": "PASS", "checkout": "NOT RUN",
                "nativeDevice": "NOT RUN", "hostedProviderLifecycle": "NOT RUN"}
            journey_principal = journey.get("databasePrincipal", {})
            if not isinstance(journey_principal, dict):
                raise ValueError("Invalid journey principal")
            if (any(journey.get(key) != value for key, value in expected_journey.items())
                    or type(journey.get("httpRequests")) is not int or journey["httpRequests"] <= 0
                    or any(type(journey_principal.get(key)) is not bool for key in ("superuser", "bypassRls"))):
                reasons.append("Continuous HTTP journey execution evidence is invalid")
            else:
                result["httpJourney"] = {**expected_journey, "httpRequests": journey["httpRequests"],
                    "databasePrincipal": {"superuser": journey_principal["superuser"],
                        "bypassRls": journey_principal["bypassRls"],
                        "limitation": "Journey fixture principal is separate from restricted-principal and hosted-role acceptance"}}
        if not reasons:
            result["status"] = "PASS"
    except (ValueError, OSError, ET.ParseError, TypeError, KeyError):
        # Do not include XML, JSON contents, arbitrary exception messages, or paths in the artifact.
        result["status"] = "FAIL"
        reasons.append("Invalid source inventory or test/evidence result format")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--commit")
    parser.add_argument("--maven-outcome", choices=("success", "failure", "cancelled", "skipped"), default="success")
    args = parser.parse_args()
    commit = args.commit or subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=args.root, text=True).strip()
    try:
        server = subprocess.run(["docker", "version", "--format", "{{.Server.Version}}"],
                                capture_output=True, text=True, timeout=15)
        version = server.stdout.strip()
        docker = {"available": server.returncode == 0}
        if server.returncode == 0 and re.fullmatch(r"[\w.+-]{1,64}", version):
            docker["serverVersion"] = version
    except (OSError, subprocess.TimeoutExpired):
        docker = {"available": False}
    result = assess(args.root, commit, args.maven_outcome, docker)
    directory = args.root / "app/api/target/postgres-acceptance"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "acceptance.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"PostgreSQL acceptance: {result['status']}; " + json.dumps(result.get("totals", {})))
    for reason in result["reasons"]:
        print(reason)
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
