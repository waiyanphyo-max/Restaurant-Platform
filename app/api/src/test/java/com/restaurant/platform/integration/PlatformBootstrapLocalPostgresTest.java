package com.restaurant.platform.integration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import java.util.Properties;

/** Uses an explicitly configured disposable loopback fixture, never hosted Supabase. */
@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class PlatformBootstrapLocalPostgresTest {
    @Test
    void bootstrapReceiptsArePrivateConstrainedAndTenantScoped() {
        PlatformBootstrapDatabaseChecks.verifySchema(source());
    }

    @Test
    void twoSyntheticRestaurantsShareServicesButKeepCatalogBrandAndOwnerIsolation() throws Exception {
        withFactory(factory -> PlatformBootstrapDatabaseChecks.verifyTwoTenantWorkflow(source(), factory));
    }

    @Test
    void concurrentUncertainRetriesAndRollbackCannotDuplicateCatalogRows() throws Exception {
        withFactory(factory -> PlatformBootstrapDatabaseChecks.verifyConcurrentRetryAndRollback(source(), factory));
    }

    @Test
    void concurrentManifestReviewsCannotLoseMappingsAndOldReceiptReplayCannotRevertTheCurrentManifest() throws Exception {
        withFactory(factory -> PlatformBootstrapDatabaseChecks.verifyConcurrentManifestReview(source(), factory));
    }

    private DriverManagerDataSource source() {
        return new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"), "postgres", "");
    }

    private void withFactory(Checks checks) throws Exception {
        var factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(source());
        factory.setPackagesToScan("com.restaurant.platform.entity");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        var properties = new Properties();
        properties.setProperty("hibernate.hbm2ddl.auto", "validate");
        properties.setProperty("hibernate.jdbc.time_zone", "UTC");
        factory.setJpaProperties(properties);
        try {
            factory.afterPropertiesSet();
            checks.run(factory.getObject());
        } finally {
            factory.destroy();
        }
    }

    @FunctionalInterface
    private interface Checks {
        void run(jakarta.persistence.EntityManagerFactory factory) throws Exception;
    }
}
