package com.restaurant.platform.integration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Same checks as the CI migration suite, opt-in on an explicitly disposable loopback database. */
@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class RestrictedPrincipalLocalPostgresTest {
    @Test
    void privateTablesRequireExplicitTrustedServerCapabilities() throws Exception {
        RestrictedPrincipalDatabaseChecks.verify(new DriverManagerDataSource(
                System.getenv("ACCOUNTING_TEST_DATABASE_URL"), "postgres", ""));
    }
}
