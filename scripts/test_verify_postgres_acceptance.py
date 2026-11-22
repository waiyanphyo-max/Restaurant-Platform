"""Synthetic guard fixtures; these tests do not claim PostgreSQL execution."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("guard", Path(__file__).with_name("verify-postgres-acceptance.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
COMMIT = "a" * 40


class AcceptanceGuardTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        migrations = self.root / "supabase/migrations"
        migrations.mkdir(parents=True)
        for index in range(35):
            (migrations / f"202611{index:08d}_fixture.sql").write_text("SELECT 1;\n", encoding="utf-8")
        self.reports = self.root / "app/api/target/surefire-reports"
        self.reports.mkdir(parents=True)
        self.evidence = self.root / "app/api/target/postgres-acceptance/database.json"
        self.evidence.parent.mkdir()
        self.database = {"sourceCommit": COMMIT, "serverVersionNum": 170006, "serverVersion": "17.6",
                         "containerImage": "postgres:17-alpine", "sourceTreeDirty": False,
                         "schemaValidated": True, "legacyShoppingSeeded": True, "setupStatus": "PASS",
                         "migrations": [{**item, "applied": True} for item in guard.source_inventory(self.root)]}
        self.write_evidence()
        self.principal = {
            "status": "PASS", "serverVersionNum": 170006,
            "trustedServer": {"superuser": False, "ownsTables": False, "bypassRls": True,
                              "grants": {"restaurant_runtime_branding": ["SELECT", "INSERT", "UPDATE"],
                                         "restaurant_bootstrap_steps": ["SELECT", "INSERT"],
                                         "restaurant_featured_product": ["SELECT", "INSERT", "UPDATE"]}},
            "nonBypassProbe": "same object grants; RLS hides reads and denies writes",
            "clientRoles": {"anon": "DENIED", "authenticated": "DENIED", "service_role": "DENIED"},
            "foreignFeaturedReference": "DENIED:23503", "unrelatedPrivateTables": "DENIED:42501",
            "fixtureRolesAndGrantsRolledBack": True}
        self.write_principal()
        self.journey = {
            "schemaVersion": 1, "status": "PASS", "serverVersionNum": 170006, "httpRequests": 80,
            "phases": guard.JOURNEY_PHASES, "syntheticExternalBoundaries": guard.JOURNEY_BOUNDARIES,
            "identityScope": "One invocation's synthetic A/B users and returned restaurant/catalog UUIDs reused across all phases",
            "databasePrincipal": {"superuser": True, "bypassRls": True},
            "invitationCount": 0, "recoveryEmailCount": 0, "cleanup": "PASS", "checkout": "NOT RUN",
            "nativeDevice": "NOT RUN", "hostedProviderLifecycle": "NOT RUN", "unexpectedSecret": "PRIVATE_SENTINEL"}
        self.write_journey()
        self.write_suite()

    def write_journey(self):
        (self.evidence.parent / "http-journey.json").write_text(json.dumps(self.journey), encoding="utf-8")

    def write_principal(self):
        (self.evidence.parent / "restricted-principal.json").write_text(json.dumps(self.principal), encoding="utf-8")

    def write_evidence(self):
        self.evidence.write_text(json.dumps(self.database), encoding="utf-8")

    def write_suite(self, skipped=False, failed=False, missing=False):
        names = sorted(guard.REQUIRED_CASES)
        if missing:
            names.pop()
        suite = ET.Element("testsuite", name=guard.SUITE, tests=str(len(names)),
                           failures=str(int(failed)), errors="0", skipped=str(len(names) if skipped else 0))
        for index, name in enumerate(names):
            case = ET.SubElement(suite, "testcase", name=name, classname=guard.SUITE)
            if skipped:
                ET.SubElement(case, "skipped", message="Infrastructure unavailable")
            elif failed and index == 0:
                ET.SubElement(case, "failure", message="Synthetic assertion")
        # Must never escape into sanitized artifacts.
        ET.SubElement(ET.SubElement(suite, "properties"), "property", name="secret", value="PRIVATE_SENTINEL")
        ET.SubElement(suite, "system-out").text = "PRIVATE_SENTINEL"
        ET.ElementTree(suite).write(self.reports / f"TEST-{guard.SUITE}.xml", encoding="utf-8")

    def assess(self, outcome="success", available=True):
        return guard.assess(self.root, COMMIT, outcome, {"available": available})

    def test_valid_execution_passes_and_sanitizes(self):
        result = self.assess()
        self.assertEqual("PASS", result["status"])
        self.assertEqual(len(guard.REQUIRED_CASES), result["totals"]["executed"])
        self.assertEqual(23, len(guard.REQUIRED_CASES))
        self.assertEqual(35, len(result["appliedMigrations"]))
        self.assertEqual("DENIED:23503", result["restrictedPrincipal"]["foreignFeaturedReference"])
        self.assertEqual(80, result["httpJourney"]["httpRequests"])
        self.assertEqual(12, len(result["httpJourney"]["phases"]))
        self.assertNotIn("PRIVATE_SENTINEL", json.dumps(result))

    def test_no_docker_mandatory_skips_are_blocked(self):
        self.write_suite(skipped=True)
        result = self.assess(available=False)
        self.assertEqual("BLOCKED", result["status"])
        self.assertTrue(all(case["status"] == "SKIPPED" for case in result["suites"][0]["cases"]))

    def test_mandatory_skip_with_docker_is_skipped_not_pass(self):
        self.write_suite(skipped=True)
        self.assertEqual("SKIPPED", self.assess()["status"])

    def test_executed_failure_fails(self):
        self.write_suite(failed=True)
        self.assertEqual("FAIL", self.assess()["status"])

    def test_missing_mandatory_case_fails(self):
        self.write_suite(missing=True)
        self.assertEqual("FAIL", self.assess()["status"])

    def test_missing_suite_is_blocked(self):
        next(self.reports.glob("*.xml")).unlink()
        self.assertEqual("BLOCKED", self.assess()["status"])

    def test_false_declared_counts_fail(self):
        path = next(self.reports.glob("*.xml"))
        tree = ET.parse(path)
        tree.getroot().set("skipped", "1")
        tree.write(path)
        self.assertEqual("FAIL", self.assess()["status"])

    def test_old_postgres_version_fails(self):
        self.database["serverVersionNum"] = 160004
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_wrong_commit_fails(self):
        self.database["sourceCommit"] = "b" * 40
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_unexpected_container_image_or_missing_tree_state_fails(self):
        self.database["containerImage"] = "postgres:16-alpine"
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])
        self.database["containerImage"] = "postgres:17-alpine"
        self.database.pop("sourceTreeDirty")
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_principal_evidence_missing_or_wrong_version_fails(self):
        self.principal["serverVersionNum"] = 160004
        self.write_principal()
        self.assertEqual("FAIL", self.assess()["status"])
        (self.evidence.parent / "restricted-principal.json").unlink()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_missing_journey_evidence_fails(self):
        (self.evidence.parent / "http-journey.json").unlink()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_wrong_journey_database_version_fails(self):
        self.journey["serverVersionNum"] = 160004
        self.write_journey()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_missing_journey_phase_or_failed_cleanup_fails(self):
        self.journey["phases"] = guard.JOURNEY_PHASES[:-1]
        self.write_journey()
        self.assertEqual("FAIL", self.assess()["status"])
        self.journey["phases"] = guard.JOURNEY_PHASES
        self.journey["cleanup"] = "FAIL"
        self.write_journey()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_changed_migration_bytes_fail(self):
        next((self.root / "supabase/migrations").glob("*.sql")).write_text("SELECT 2;", encoding="utf-8")
        self.assertEqual("FAIL", self.assess()["status"])

    def test_wrong_migration_order_or_unapplied_migration_fails(self):
        self.database["migrations"].reverse()
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])
        self.database["migrations"].reverse()
        self.database["migrations"][0]["applied"] = False
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_missing_legacy_upgrade_seed_fails(self):
        self.database["legacyShoppingSeeded"] = False
        self.write_evidence()
        self.assertEqual("FAIL", self.assess()["status"])

    def test_maven_failure_never_passes(self):
        self.assertEqual("FAIL", self.assess(outcome="failure")["status"])

    def test_cancelled_or_skipped_maven_never_passes(self):
        self.assertEqual("BLOCKED", self.assess(outcome="cancelled")["status"])
        self.assertEqual("BLOCKED", self.assess(outcome="skipped")["status"])

    def test_malformed_xml_fails_without_disclosing_contents(self):
        next(self.reports.glob("*.xml")).write_text("PRIVATE_SENTINEL <invalid", encoding="utf-8")
        result = self.assess()
        self.assertEqual("FAIL", result["status"])
        self.assertNotIn("PRIVATE_SENTINEL", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
