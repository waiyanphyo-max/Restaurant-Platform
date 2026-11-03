package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CreateQrOrderRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration;
import com.restaurant.platform.entity.RestaurantPlatformConfiguration;
import com.restaurant.platform.service.QrOrderIdempotencyService;
import com.restaurant.platform.service.PushNotificationOutboxRepository;
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

    @Test
    void restaurantInboxQueriesExcludeOtherTenantsAndUsers() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID first = UUID.randomUUID(), second = UUID.randomUUID(), user = UUID.randomUUID(), otherUser = UUID.randomUUID();
        for (UUID id : List.of(first, second)) jdbc.update("""
                INSERT INTO public.restaurants (id, name, slug, township, city) VALUES (?, 'Inbox Test', ?, 'Bahan', 'Yangon')
                """, id, "inbox-" + id.toString().replace("-", ""));
        for (UUID id : List.of(user, otherUser)) jdbc.update("INSERT INTO auth.users (id) VALUES (?)", id);
        UUID firstOrder = UUID.randomUUID(), secondOrder = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.orders (id, restaurant_id, order_number, order_type, order_channel, subtotal, total_amount)
                VALUES (?, ?, 'INBOX-1', 'TAKEAWAY', 'STAFF', 1000, 1000), (?, ?, 'INBOX-2', 'TAKEAWAY', 'STAFF', 1000, 1000)
                """, firstOrder, first, secondOrder, second);
        UUID counter = UUID.randomUUID(), ticket = UUID.randomUUID();
        jdbc.update("INSERT INTO public.daily_queue_counters (id, restaurant_id, queue_date) VALUES (?, ?, CURRENT_DATE)", counter, second);
        jdbc.update("""
                INSERT INTO public.queue_tickets (id, restaurant_id, daily_counter_id, queue_number, display_code)
                VALUES (?, ?, ?, 1, 'I001')
                """, ticket, second, counter);
        jdbc.update("UPDATE public.orders SET queue_ticket_id = ? WHERE id = ?", ticket, secondOrder);
        UUID own = UUID.randomUUID(), crossTenant = UUID.randomUUID(), crossUser = UUID.randomUUID(), conflicting = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.notifications (id, user_id, order_id, notification_type, title, body, channel)
                VALUES (?, ?, ?, 'ORDER_UPDATE', 'Own', 'Own', 'IN_APP'),
                       (?, ?, ?, 'ORDER_UPDATE', 'Other tenant', 'Other tenant', 'IN_APP'),
                       (?, ?, ?, 'ORDER_UPDATE', 'Other user', 'Other user', 'IN_APP')
                """, own, user, firstOrder, crossTenant, user, secondOrder, crossUser, otherUser, firstOrder);
        jdbc.update("""
                INSERT INTO public.notifications (id, user_id, order_id, queue_ticket_id, notification_type, title, body, channel)
                VALUES (?, ?, ?, ?, 'ORDER_UPDATE', 'Conflicting references', 'Excluded', 'IN_APP')
                """, conflicting, user, firstOrder, ticket);
        var factory = entityManagerFactoryBean.getObject();
        assertNotNull(factory);
        var entityManager = factory.createEntityManager();
        try {
            var repository = new org.springframework.data.jpa.repository.support.JpaRepositoryFactory(entityManager)
                    .getRepository(com.restaurant.platform.repository.AppNotificationRepository.class);
            assertEquals(List.of(own), repository.findForRestaurantUser(first, user, null).stream().map(com.restaurant.platform.entity.AppNotification::getId).toList());
            assertTrue(repository.findForRestaurantUserById(first, user, crossTenant).isEmpty());
            assertTrue(repository.findForRestaurantUserById(first, user, crossUser).isEmpty());
            assertTrue(repository.findForRestaurantUserById(first, user, conflicting).isEmpty());
            assertTrue(repository.findForRestaurantUserById(second, user, conflicting).isEmpty());
            assertTrue(repository.findForRestaurantUser(first, user, "READ").isEmpty());
            assertTrue(repository.findForRestaurantUserById(first, user, own).isPresent());
        } finally { entityManager.close(); }
    }

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
    void accountingDomainsPreserveFinancialIntegrity() throws Exception {
        com.restaurant.platform.accounting.AccountingDatabaseChecks.verify(dataSource);
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

        assertTrue(jdbc.queryForObject("""
                SELECT relrowsecurity
                FROM pg_class
                WHERE oid = 'public.push_notification_outbox'::regclass
                """, Boolean.class), "Push outbox records must remain in an RLS-enabled table");

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
    void notificationTriggerQueuesOneOutboxItemForEachActiveDevice() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID userId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO auth.users (id, raw_user_meta_data)
                VALUES (?, '{}'::jsonb)
                """, userId);

        UUID activeDeviceOne = UUID.randomUUID();
        UUID activeDeviceTwo = UUID.randomUUID();
        UUID inactiveDevice = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.user_devices (id, user_id, push_token, platform, is_active)
                VALUES (?, ?, ?, 'WEB', TRUE),
                       (?, ?, ?, 'ANDROID', TRUE),
                       (?, ?, ?, 'IOS', FALSE)
                """,
                activeDeviceOne, userId, "test-web-token-" + activeDeviceOne,
                activeDeviceTwo, userId, "test-android-token-" + activeDeviceTwo,
                inactiveDevice, userId, "test-inactive-token-" + inactiveDevice);

        UUID notificationId = jdbc.queryForObject("""
                INSERT INTO public.notifications
                    (user_id, notification_type, title, body, channel)
                VALUES (?, 'ORDER_READY', 'Order ready', 'Your order is ready.', 'IN_APP')
                RETURNING id
                """, UUID.class, userId);

        assertEquals(2, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM public.push_notification_outbox
                WHERE notification_id = ?
                """, Integer.class, notificationId));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM public.push_notification_outbox
                WHERE notification_id = ? AND device_id = ?
                """, Integer.class, notificationId, inactiveDevice));

        PushNotificationOutboxRepository outbox = new PushNotificationOutboxRepository(
                new NamedParameterJdbcTemplate(dataSource));
        List<PushNotificationOutboxRepository.OutboxItem> claimed = outbox.claimBatch(10, 8);
        assertEquals(2, claimed.size());
        assertTrue(claimed.stream().allMatch(item -> item.attempts() == 1));

        var first = claimed.getFirst();
        PushNotificationOutboxRepository.PushPayload payload =
                outbox.findPayload(first.id()).orElseThrow();
        assertEquals(notificationId, payload.notificationId());
        assertEquals(userId, payload.userId());
        assertTrue(payload.active());
        assertTrue(payload.pushToken().startsWith("test-"));

        outbox.markSent(first.id());
        assertEquals("SENT", jdbc.queryForObject("""
                SELECT status
                FROM public.push_notification_outbox
                WHERE id = ?
                """, String.class, first.id()));
    }

    @Test
    void platformConfigurationMigrationIsTenantScopedAndUnavailableToClientRoles() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertTrue(jdbc.queryForObject("""
                SELECT relrowsecurity FROM pg_class
                WHERE oid = 'public.restaurant_platform_configuration'::regclass
                """, Boolean.class));
        for (String role : List.of("anon", "authenticated")) {
            assertFalse(jdbc.queryForObject("""
                    SELECT has_table_privilege(?, 'public.restaurant_platform_configuration', 'SELECT')
                    """, Boolean.class, role));
            assertFalse(jdbc.queryForObject("""
                    SELECT has_table_privilege(?, 'public.restaurant_platform_configuration', 'INSERT')
                    """, Boolean.class, role));
        }
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        for (UUID id : List.of(first, second)) {
            jdbc.update("""
                    INSERT INTO public.restaurants (id, name, slug, township, city)
                    VALUES (?, 'Config Test', ?, 'Bahan', 'Yangon')
                    """, id, "config-" + id.toString().replace("-", ""));
        }
        jdbc.update("""
                INSERT INTO public.restaurant_platform_configuration (restaurant_id, configuration)
                VALUES (?, '{"primaryColor":"#222222"}'::jsonb)
                """, second);
        var configuration = new PlatformRestaurantConfiguration("#111111", "#ABCDEF",
                new PlatformRestaurantConfiguration.GuestDomains(
                        List.of("staging.garden.example.test"), List.of("garden.example.test")),
                new PlatformRestaurantConfiguration.Android(
                        new PlatformRestaurantConfiguration.AndroidApplication("Garden Operations",
                                "test.garden.operations.staging", "test.garden.operations", "assets/garden/operations.png"),
                        new PlatformRestaurantConfiguration.AndroidApplication("Garden Customer",
                                "test.garden.customer.staging", "test.garden.customer", "assets/garden/customer.png")));
        EntityManagerFactory factory = entityManagerFactoryBean.getObject();
        assertNotNull(factory);
        var entityManager = factory.createEntityManager();
        try {
            entityManager.getTransaction().begin();
            var row = new RestaurantPlatformConfiguration();
            row.setRestaurantId(first);
            row.setConfiguration(configuration);
            entityManager.persist(row);
            entityManager.flush();
            entityManager.clear();

            var restored = entityManager.find(RestaurantPlatformConfiguration.class, first);
            assertNotNull(restored);
            assertEquals(first, restored.getRestaurantId());
            assertEquals(configuration, restored.getConfiguration(),
                    "Hibernate must round-trip nested configuration records, domain arrays, and Android metadata through JSONB");
            assertNotNull(restored.getUpdatedAt(), "Hibernate should populate the configuration update timestamp");
            entityManager.getTransaction().commit();
        } finally {
            if (entityManager.getTransaction().isActive()) entityManager.getTransaction().rollback();
            entityManager.close();
        }
        assertEquals("#111111", jdbc.queryForObject("""
                SELECT configuration->>'primaryColor' FROM public.restaurant_platform_configuration
                WHERE restaurant_id = ?
                """, String.class, first));
        assertEquals("#222222", jdbc.queryForObject("""
                SELECT configuration->>'primaryColor' FROM public.restaurant_platform_configuration
                WHERE restaurant_id = ?
                """, String.class, second));
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
                        email text,
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
