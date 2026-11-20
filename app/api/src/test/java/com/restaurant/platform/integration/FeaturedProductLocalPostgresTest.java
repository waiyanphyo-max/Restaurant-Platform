package com.restaurant.platform.integration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import java.util.Properties;

/** Requires the disposable loopback-only schema fixture, never hosted Supabase. */
@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class FeaturedProductLocalPostgresTest {
    @Test void migrationIsolationAndServerOnlyPrivilegesHold() {
        FeaturedProductDatabaseChecks.verify(new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"), "postgres", ""));
    }
    @Test void actualConcurrentOwnerSelectionsAndRollbackPreserveTenantSelections() throws Exception {
        var source = new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"), "postgres", "");
        var factory = new LocalContainerEntityManagerFactoryBean(); factory.setDataSource(source);
        factory.setPackagesToScan("com.restaurant.platform.entity"); factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        var properties = new Properties(); properties.setProperty("hibernate.hbm2ddl.auto", "validate");
        properties.setProperty("hibernate.jdbc.time_zone", "UTC"); factory.setJpaProperties(properties);
        try { factory.afterPropertiesSet(); FeaturedProductDatabaseChecks.verifyServiceConcurrency(source, factory.getObject()); }
        finally { factory.destroy(); }
    }
}
