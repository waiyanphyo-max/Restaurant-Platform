package com.restaurant.platform.integration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import java.util.Properties;

/** Never points at hosted Supabase; requires the disposable loopback QA database. */
@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class RuntimeBrandingLocalPostgresTest {
    @Test
    void migrationConstraintsPrivilegesAndTenantPalettesHold() {
        var source = new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"), "postgres", "");
        RuntimeBrandingDatabaseChecks.verify(source);
    }

    @Test
    void concurrentInitializationAndExistingPaletteWritesUseActualDatabaseLocks() throws Exception {
        var source = new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"), "postgres", "");
        var factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(source);
        factory.setPackagesToScan("com.restaurant.platform.entity");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        var properties = new Properties();
        properties.setProperty("hibernate.hbm2ddl.auto", "validate");
        properties.setProperty("hibernate.jdbc.time_zone", "UTC");
        factory.setJpaProperties(properties);
        try {
            factory.afterPropertiesSet();
            RuntimeBrandingDatabaseChecks.verifyConcurrentServiceWrites(source, factory.getObject());
        } finally {
            factory.destroy();
        }
    }
}
