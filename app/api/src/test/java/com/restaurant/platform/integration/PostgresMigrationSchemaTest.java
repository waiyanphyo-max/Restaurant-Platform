package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CreateQrOrderRequest;
import com.restaurant.platform.service.QrOrderIdempotencyService;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
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
    void postgresIdempotencyStoreReplaysEncryptedResponseAndRejectsChangedPayload() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID restaurantId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.restaurants (id, name, slug, township, city)
                VALUES (?, ?, ?, ?, ?)
                """, restaurantId, "Idempotency Test",
                "idem-" + restaurantId.toString().replace("-", ""),
                "Tamwe", "Yangon");

        String encryptionKey = Base64.getEncoder().encodeToString(new byte[32]);
        QrOrderIdempotencyService idempotency = new QrOrderIdempotencyService(
                new NamedParameterJdbcTemplate(dataSource),
                tools.jackson.databind.json.JsonMapper.builder().build(),
                encryptionKey);
        String key = "db-checkout-replay-0001";
        CreateQrOrderRequest originalRequest =
                new CreateQrOrderRequest("common-qr-secret", List.of());
        String privateTrackingToken = "db-integration-private-queue-token";
        CreateOrderResponse response = new CreateOrderResponse(
                UUID.randomUUID(), "ORD-20261024-DBTEST01",
                "TAKEAWAY", "COMMON_QR", "PENDING", "MMK",
                3500L, 0L, 0L, 3500L,
                new CreateOrderResponse.QueueInfo(
                        UUID.randomUUID(), 12, "012", "WAITING", privateTrackingToken));

        var claim = idempotency.begin(restaurantId, "COMMON_QR", key, originalRequest);
        assertTrue(claim.claimed(), "The first request should claim the idempotency key.");
        idempotency.complete(claim, response);

        byte[] ciphertext = jdbc.queryForObject("""
                SELECT response_ciphertext
                FROM public.qr_order_idempotency
                WHERE restaurant_id = ?
                  AND operation = 'COMMON_QR'
                """, byte[].class, restaurantId);
        assertNotNull(ciphertext);
        assertFalse(new String(ciphertext, StandardCharsets.UTF_8).contains(privateTrackingToken),
                "The queue tracking token must not be stored as plaintext.");

        var replay = idempotency.begin(restaurantId, "COMMON_QR", key, originalRequest);
        assertNotNull(replay.replayResponse());
        assertEquals(response, replay.replayResponse(),
                "A retry with the same key and payload should return the original response.");

        ApiException mismatch = assertThrows(ApiException.class, () ->
                idempotency.begin(restaurantId, "COMMON_QR", key,
                        new CreateQrOrderRequest("different-qr-secret", List.of())));
        assertEquals("IDEMPOTENCY_KEY_REUSED", mismatch.getCode());
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
        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE ROLE anon NOLOGIN");
            statement.execute("CREATE ROLE authenticated NOLOGIN");
            statement.execute("CREATE ROLE service_role NOLOGIN BYPASSRLS");
            statement.execute("CREATE SCHEMA auth");
            statement.execute("CREATE SCHEMA extensions");
            statement.execute("""
                    CREATE TABLE auth.users (
                        id uuid PRIMARY KEY,
                        raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
                    )
                    """);
            statement.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions");
        }
    }

    private static void applyAllRepositoryMigrations() throws Exception {
        try (Stream<Path> files = Files.list(migrationDirectory)) {
            var migrations = files
                    .filter(path -> path.getFileName().toString().endsWith(".sql"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();

            for (Path migration : migrations) {
                String containerPath = "/tmp/" + migration.getFileName();
                POSTGRES.copyFileToContainer(
                        MountableFile.forHostPath(migration.toAbsolutePath()), containerPath);
                var result = POSTGRES.execInContainer(
                        "psql", "-U", POSTGRES.getUsername(), "-d", POSTGRES.getDatabaseName(),
                        "-v", "ON_ERROR_STOP=1", "-f", containerPath);
                if (result.getExitCode() != 0) {
                    throw new IllegalStateException(
                            "Failed to apply repository migration " + migration.getFileName()
                                    + "\\n" + result.getStdout() + "\\n" + result.getStderr());
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
