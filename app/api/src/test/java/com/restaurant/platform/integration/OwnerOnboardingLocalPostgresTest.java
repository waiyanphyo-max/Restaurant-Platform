package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.repository.OwnerOnboardingRepository;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Opt-in, isolated fixture database only. Never uses application datasource credentials. */
@EnabledIfEnvironmentVariable(named = "OWNER_ONBOARDING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/owner_onboarding_verify")
class OwnerOnboardingLocalPostgresTest {
    private static DriverManagerDataSource dataSource;
    private static JdbcTemplate jdbc;
    private static DataSourceTransactionManager transactions;
    private static OwnerOnboardingRepository repository;

    @BeforeAll
    static void isolatedSchema() throws Exception {
        dataSource = new DriverManagerDataSource(System.getenv("OWNER_ONBOARDING_TEST_DATABASE_URL"), "postgres", "");
        jdbc = new JdbcTemplate(dataSource);
        // A fresh, explicitly named test database is required; never replace pre-existing application tables.
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS auth");
        jdbc.execute("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
        jdbc.execute("CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, deleted_at timestamptz, banned_until timestamptz)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS public.restaurants(id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS public.restaurant_members(id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id), user_id uuid NOT NULL REFERENCES auth.users(id), role text NOT NULL)");
        if (jdbc.queryForObject("SELECT to_regclass('public.owner_account_onboarding') IS NULL", Boolean.class)) {
            try (var connection = dataSource.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(Path.of("../../supabase/migrations/20261112090000_owner_account_onboarding.sql")));
            }
        }
        transactions = new DataSourceTransactionManager(dataSource);
        repository = new OwnerOnboardingRepository(new NamedParameterJdbcTemplate(dataSource), transactions);
    }

    @Test
    void simultaneousRequestsForSameOwnerReserveExactlyOnceAcrossConnections() throws Exception {
        var fixture = fixture();
        UUID otherActor = user();
        var outcomes = race(() -> reserveOutcome(fixture.restaurant, fixture.owner, fixture.actor),
                () -> reserveOutcome(fixture.restaurant, fixture.owner, otherActor));
        assertEquals(1, outcomes.stream().filter("RESERVED"::equals).count());
        assertEquals(1, outcomes.stream().filter("OWNER_INVITATION_RATE_LIMITED"::equals).count());
        assertEquals(1, count(fixture.owner));
    }

    @Test
    void committedFailureAndCallerRollbackBothStillConsumeCooldown() {
        var fixture = fixture();
        var outer = new TransactionTemplate(transactions);
        outer.execute(status -> {
            var reservation = repository.reserve(fixture.restaurant, fixture.owner, fixture.actor);
            repository.finish(reservation.id(), "FAILED", "PROVIDER_ERROR");
            status.setRollbackOnly();
            return null;
        });
        assertEquals(1, count(fixture.owner));
        assertEquals("FAILED", jdbc.queryForObject("SELECT outcome FROM public.owner_invitation_attempts WHERE owner_user_id = ?", String.class, fixture.owner));
        assertEquals("OWNER_INVITATION_RATE_LIMITED", assertThrows(ApiException.class,
                () -> repository.reserve(fixture.restaurant, fixture.owner, fixture.actor)).getCode());
    }

    @Test
    void hourlyLimitsCoverRepeatedOwnersAndAnAdministratorAcrossOwners() {
        var ownerLimited = fixture();
        for (int i = 0; i < 5; i++) oldAttempt(ownerLimited);
        assertEquals("OWNER_INVITATION_RATE_LIMITED", assertThrows(ApiException.class,
                () -> repository.reserve(ownerLimited.restaurant, ownerLimited.owner, ownerLimited.actor)).getCode());

        var actorLimited = fixture();
        for (int i = 0; i < 20; i++) {
            var other = fixture();
            oldAttempt(new Fixture(other.restaurant, other.owner, actorLimited.actor));
        }
        assertEquals("OWNER_INVITATION_RATE_LIMITED", assertThrows(ApiException.class,
                () -> repository.reserve(actorLimited.restaurant, actorLimited.owner, actorLimited.actor)).getCode());
        assertEquals(0, count(actorLimited.owner));
    }

    @Test
    void sameAdministratorConcurrentRequestsCannotBypassHourlyLimit() throws Exception {
        var first = fixture();
        var second = fixture();
        for (int i = 0; i < 19; i++) {
            var other = fixture();
            oldAttempt(new Fixture(other.restaurant, other.owner, first.actor));
        }
        var outcomes = race(() -> reserveOutcome(first.restaurant, first.owner, first.actor),
                () -> reserveOutcome(second.restaurant, second.owner, first.actor));
        assertEquals(1, outcomes.stream().filter("RESERVED"::equals).count());
        assertEquals(1, outcomes.stream().filter("OWNER_INVITATION_RATE_LIMITED"::equals).count());
    }

    @Test
    void verifiedCompletionIsIdempotentBlocksResendAndDoesNotAlterMembership() {
        var fixture = fixture();
        assertTrue(repository.findCompletedAt(fixture.owner).isEmpty());
        var completed = repository.complete(fixture.owner);
        assertEquals(completed, repository.complete(fixture.owner));
        assertEquals(completed, repository.findCompletedAt(fixture.owner).orElseThrow());
        assertEquals("OWNER_ONBOARDING_COMPLETE", assertThrows(ApiException.class,
                () -> repository.reserve(fixture.restaurant, fixture.owner, fixture.actor)).getCode());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_members WHERE restaurant_id = ? AND user_id = ? AND role = 'OWNER'", Integer.class, fixture.restaurant, fixture.owner));
        assertEquals(0, count(fixture.owner));
    }

    @Test
    void inactiveRestaurantsBannedDeletedAndCrossTenantAccountsCannotSetup() {
        var inactive = fixture();
        jdbc.update("UPDATE public.restaurants SET is_active = false WHERE id = ?", inactive.restaurant);
        assertIneligible(inactive);
        var banned = fixture();
        jdbc.update("UPDATE auth.users SET banned_until = CURRENT_TIMESTAMP + interval '1 day' WHERE id = ?", banned.owner);
        assertIneligible(banned);
        var deleted = fixture();
        jdbc.update("UPDATE auth.users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", deleted.owner);
        assertIneligible(deleted);
        var eligible = fixture();
        assertEquals("RESTAURANT_OWNER_NOT_FOUND", assertThrows(ApiException.class,
                () -> repository.reserve(inactive.restaurant, eligible.owner, eligible.actor)).getCode());
        assertEquals(0, count(eligible.owner));
    }

    @Test
    void browserAndMobileDatabaseRolesCannotReadAuditOrForgeCompletion() throws Exception {
        for (String role : List.of("anon", "authenticated")) {
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                statement.execute("SET ROLE " + role);
                assertEquals("42501", assertThrows(SQLException.class,
                        () -> statement.executeQuery("SELECT * FROM public.owner_invitation_attempts")).getSQLState());
                assertEquals("42501", assertThrows(SQLException.class,
                        () -> statement.executeUpdate("INSERT INTO public.owner_account_onboarding VALUES ('00000000-0000-0000-0000-000000000001', now())")).getSQLState());
            }
        }
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM pg_class WHERE oid IN ('public.owner_account_onboarding'::regclass, 'public.owner_invitation_attempts'::regclass) AND relrowsecurity", Integer.class));
    }

    @Test
    void missingMigrationFailsSafelyWithoutCreatingAttemptOrAbortingCallersTransaction() {
        var fixture = fixture();
        // Reversible schema fault in this isolated fixture database only.
        jdbc.execute("ALTER TABLE public.owner_account_onboarding RENAME TO owner_account_onboarding_test_unavailable");
        try {
            var caller = new TransactionTemplate(transactions);
            caller.execute(status -> {
                assertEquals("OWNER_INVITATION_NOT_CONFIGURED", assertThrows(ApiException.class,
                        () -> repository.findCompletedAt(fixture.owner)).getCode());
                // The failed lookup used REQUIRES_NEW, so the surrounding transaction stays usable.
                assertEquals(1, jdbc.queryForObject("SELECT 1", Integer.class));
                return null;
            });
            assertEquals("OWNER_INVITATION_NOT_CONFIGURED", assertThrows(ApiException.class,
                    () -> repository.reserve(fixture.restaurant, fixture.owner, fixture.actor)).getCode());
            assertEquals(0, count(fixture.owner));
        } finally {
            jdbc.execute("ALTER TABLE public.owner_account_onboarding_test_unavailable RENAME TO owner_account_onboarding");
        }
    }

    private static void assertIneligible(Fixture fixture) {
        assertEquals("RESTAURANT_OWNER_NOT_FOUND", assertThrows(ApiException.class,
                () -> repository.reserve(fixture.restaurant, fixture.owner, fixture.actor)).getCode());
        assertEquals("RESTAURANT_OWNER_NOT_FOUND", assertThrows(ApiException.class,
                () -> repository.complete(fixture.owner)).getCode());
        assertTrue(repository.findCompletedAt(fixture.owner).isEmpty());
    }

    private static String reserveOutcome(UUID restaurant, UUID owner, UUID actor) {
        try {
            repository.reserve(restaurant, owner, actor);
            return "RESERVED";
        } catch (ApiException exception) {
            return exception.getCode();
        }
    }

    private static List<String> race(Callable<String> first, Callable<String> second) throws Exception {
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> { assertTrue(start.await(10, TimeUnit.SECONDS)); return first.call(); });
            var b = pool.submit(() -> { assertTrue(start.await(10, TimeUnit.SECONDS)); return second.call(); });
            start.countDown();
            return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        }
    }

    private static Fixture fixture() {
        UUID restaurant = UUID.randomUUID(), owner = user(), actor = user();
        jdbc.update("INSERT INTO public.restaurants(id) VALUES (?)", restaurant);
        jdbc.update("INSERT INTO public.restaurant_members(id, restaurant_id, user_id, role) VALUES (?, ?, ?, 'OWNER')", UUID.randomUUID(), restaurant, owner);
        return new Fixture(restaurant, owner, actor);
    }

    private static UUID user() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES (?)", user);
        return user;
    }

    private static int count(UUID owner) {
        return jdbc.queryForObject("SELECT count(*) FROM public.owner_invitation_attempts WHERE owner_user_id = ?", Integer.class, owner);
    }

    private static void oldAttempt(Fixture fixture) {
        jdbc.update("INSERT INTO public.owner_invitation_attempts (id, restaurant_id, owner_user_id, requested_by_user_id, requested_at, outcome) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP - interval '2 minutes', 'FAILED')", UUID.randomUUID(), fixture.restaurant, fixture.owner, fixture.actor);
    }

    private record Fixture(UUID restaurant, UUID owner, UUID actor) {}
}
