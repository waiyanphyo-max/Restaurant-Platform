package com.restaurant.platform.accounting;

import com.restaurant.platform.integration.DeliveryEligibilityDatabaseChecks;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import java.util.Properties;
import static org.junit.jupiter.api.Assertions.*;

/** Explicit opt-in for a pre-migrated disposable database; never accepts a remote database URL. */
@EnabledIfEnvironmentVariable(named="ACCOUNTING_TEST_DATABASE_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class AccountingLocalPostgresTest {
    private DriverManagerDataSource disposableSource() {
        String url = System.getenv("ACCOUNTING_TEST_DATABASE_URL");
        assertTrue(url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify"));
        return new DriverManagerDataSource(url, "postgres", "");
    }
    @Test void realShoppingTransactionsAndHistory() { AccountingDatabaseChecks.plansSuggestionsAndPurchaseSnapshots(disposableSource()); }
    @Test void realSalesAndCashClosingTransactions() { AccountingDatabaseChecks.salesCashClosingAndReport(disposableSource()); }
    @Test void realExpenseCorrectionsAndCashHistory() { AccountingDatabaseChecks.expenseCorrectionsAndCashHistory(disposableSource()); }
    @Test void concurrentRetriesAndTenantConstraints() throws Exception { AccountingDatabaseChecks.concurrentRetriesAndTenantConstraints(disposableSource()); }
    @Test void clientAccessAndImmutableHistory() { AccountingDatabaseChecks.clientDatabaseAccessAndImmutableHistory(disposableSource()); }
    @Test void sharedManagerAccounting() { AccountingDatabaseChecks.sharedManagerAccounting(disposableSource()); }
    @Test void hibernateValidatesEntityMappingsAndDeliveryEligibility() {
        var factory = new LocalContainerEntityManagerFactoryBean();
        var source = disposableSource();
        factory.setDataSource(source);
        factory.setPackagesToScan("com.restaurant.platform.entity");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        var properties = new Properties(); properties.setProperty("hibernate.hbm2ddl.auto", "validate");
        properties.setProperty("hibernate.jdbc.time_zone", "UTC"); factory.setJpaProperties(properties);
        try {
            factory.afterPropertiesSet(); assertNotNull(factory.getObject()); assertTrue(factory.getObject().isOpen());
            DeliveryEligibilityDatabaseChecks.verify(source, factory.getObject());
        } finally { factory.destroy(); }
    }
}
