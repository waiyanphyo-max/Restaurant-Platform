package com.restaurant.platform.integration;

import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Comparator;
import java.util.Properties;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Applies the repository's real Supabase SQL migrations to a clean PostgreSQL
 * instance and checks Hibernate's mappings against the resulting schema.
 *
 * This test needs Docker. It is skipped automatically on developer machines
 * where Docker is unavailable, but runs in GitHub Actions' Ubuntu environment.
 */
@Testcontainers(disabledWithoutDocker = true)
class PostgresMigrationSchemaTest {

    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:17-alpine")
                    .withDatabaseName("restaurant_platform_test")
                    .withUsername("postgres")
                    .withPassword("postgres");

    private static DataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean entityManagerFactoryBean;
    private static Path migrationDirectory;

    @BeforeAll
    static void applyMigrationsAndValidateHibernateMappings() throws Exception {
        migrationDirectory = findMigrationDirectory();
        dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());

        createSupabaseAuthPrerequisites();
        applyAllRepositoryMigrations();
        validateHibernateSchema();
    }

    @AfterAll
    static void closeEntityManagerFactory() {
        if (entityManagerFactoryBean != null) {
            entityManagerFactoryBean.destroy();
        }
    }

    @Test
    void allMigrationsCreateTheExpectedSecurityAndCheckoutSchema() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        assertTrue(jdbc.queryForObject("""
                SELECT relrowsecurity
                FROM pg_class
                WHERE oid = 'public.qr_order_idempotency'::regclass
                """, Boolean.class), "Idempotency responses must remain in an RLS-enabled table");

        assertTrue(jdbc.queryForObject("""
                SELECT relrowsecurity
                FROM pg_class
                WHERE oid = 'public.delivery_zones'::regclass
                """, Boolean.class), "Delivery-zone records should keep RLS enabled");

        assertEquals(2, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'delivery_zones'
                  AND column_name IN ('coverage_city', 'coverage_township')
                """, Integer.class));

        assertNotNull(jdbc.queryForObject("""
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'payments_status_check'
                """, Integer.class), "Payment status constraint should exist after all migrations");

        String paymentConstraint = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid = 'public.payments'::regclass
                  AND conname = 'payments_status_check'
                """, String.class);
        assertTrue(paymentConstraint.contains("CANCELLED"),
                "The payment constraint must allow cancelled unpaid payments");

        assertNotNull(jdbc.queryForObject("""
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'restaurant_settings'
                  AND column_name = 'default_delivery_driver_user_id'
                """, Integer.class));
    }

    @Test
    void migrationDirectoryContainsTimestampOrderedSqlFiles() throws IOException {
        try (Stream<Path> files = Files.list(migrationDirectory)) {
            var names = files.filter(p -> p.getFileName().toString().endsWith(".sql"))
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .toList();

            assertFalse(names.isEmpty());
            assertTrue(names.stream().allMatch(name -> name.matches("\\d{14}_.+\\.sql")),
                    "Migration filenames must start with a 14-digit timestamp.");
            assertTrue(names.contains("20261024083000_add_qr_order_idempotency.sql"));
            assertTrue(names.contains("20261024091000_add_delivery_zone_coverage.sql"));
        }
    }

    private static void createSupabaseAuthPrerequisites() throws Exception {
        try (Connection connection = POSTGRES.createConnection(""); Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE ROLE anon NOLOGIN;
                    CREATE ROLE authenticated NOLOGIN;
                    CREATE ROLE service_role NOLOGIN BYPASSRLS;
                    CREATE SCHEMA auth;
                    CREATE SCHEMA extensions;
                    CREATE TABLE auth.users (
                        id uuid PRIMARY KEY,
                        raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
                    );
                    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
                    """);
        }
    }

    private static void applyAllRepositoryMigrations() throws Exception {
        try (Connection connection = POSTGRES.createConnection("");
             Statement statement = connection.createStatement();
             Stream<Path> files = Files.list(migrationDirectory)) {
            var migrations = files
                    .filter(path -> path.getFileName().toString().endsWith(".sql"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();

            for (Path migration : migrations) {
                String sql = Files.readString(migration, StandardCharsets.UTF_8);
                try {
                    statement.execute(sql);
                } catch (Exception exception) {
                    throw new IllegalStateException(
                            "Failed to apply repository migration " + migration.getFileName(), exception);
                }
            }
        }
    }

    private static void validateHibernateSchema() {
        DriverManagerDataSource schemaDataSource = new DriverManagerDataSource();
        schemaDataSource.setDriverClassName("org.postgresql.Driver");
        schemaDataSource.setUrl(POSTGRES.getJdbcUrl());
        schemaDataSource.setUsername(POSTGRES.getUsername());
        schemaDataSource.setPassword(POSTGRES.getPassword());
        dataSource = schemaDataSource;

        entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(schemaDataSource);
        entityManagerFactoryBean.setPackagesToScan("com.restaurant.platform.entity");
        entityManagerFactoryBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());

        Properties properties = new Properties();
        properties.setProperty("hibernate.hbm2ddl.auto", "validate");
        properties.setProperty("hibernate.jdbc.time_zone", "UTC");
        properties.setProperty("hibernate.show_sql", "false");
        entityManagerFactoryBean.setJpaProperties(properties);
        entityManagerFactoryBean.afterPropertiesSet();

        EntityManagerFactory entityManagerFactory = entityManagerFactoryBean.getObject();
        assertNotNull(entityManagerFactory);
        assertTrue(entityManagerFactory.isOpen());
    }

    private static Path findMigrationDirectory() throws IOException {
        Path current = Path.of("").toAbsolutePath().normalize();
        Path[] candidates = {
                current.resolve("supabase/migrations"),
                current.resolve("../../supabase/migrations").normalize(),
                current.resolve("../supabase/migrations").normalize()
        };
        for (Path candidate : candidates) {
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException(
                "Could not find supabase/migrations from working directory " + current);
    }
}
