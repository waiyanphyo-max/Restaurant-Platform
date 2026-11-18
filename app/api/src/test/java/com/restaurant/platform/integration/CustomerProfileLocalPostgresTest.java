package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerProfileResponse;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerProfileService;
import com.restaurant.platform.service.SupabaseMediaStorageClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.UUID;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Runs only against an explicitly configured disposable loopback test database. */
@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
@SpringBootTest(classes = CustomerProfileLocalPostgresTest.DatabaseApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=${ACCOUNTING_TEST_DATABASE_URL}",
        "spring.datasource.username=postgres", "spring.datasource.password="
})
class CustomerProfileLocalPostgresTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = OAuth2ResourceServerAutoConfiguration.class)
    @EntityScan(basePackageClasses = Profile.class)
    @EnableJpaRepositories(basePackageClasses = ProfileRepository.class)
    @Import({CustomerProfileService.class, RestaurantAuthorization.class})
    static class DatabaseApplication { }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private CustomerProfileService profiles;
    @MockitoBean private SupabaseMediaStorageClient media;

    @Test
    void repairsActualAuthUserAndPreservesLaterProfileEditsAndAddressBook() {
        UUID owner = authUser();
        jdbc.update("DELETE FROM public.profiles WHERE id = ?", owner);
        var restored = readAs(owner, owner);
        assertEquals(owner, restored.id());
        assertEquals("Auth name", restored.fullName());
        assertEquals("0912345678", restored.phone());
        assertEquals("en", restored.preferredLanguage());
        assertNotNull(restored.createdAt());
        assertNotNull(restored.updatedAt());
        assertEquals("customer@example.test", jdbc.queryForObject(
                "SELECT email FROM public.profiles WHERE id = ?", String.class, owner));

        jdbc.update("UPDATE public.profiles SET full_name = 'Customer edit', phone = '0999999999' WHERE id = ?", owner);
        UUID address = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.customer_addresses(id, user_id, label, township, city)
                VALUES (?, ?, 'Home', 'Tamwe', 'Yangon')
                """, address, owner);
        var existing = readAs(owner, owner);
        assertEquals("Customer edit", existing.fullName());
        assertEquals("0999999999", existing.phone());
        assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM public.customer_addresses WHERE user_id = ? AND id = ?", Integer.class, owner, address));
    }

    @Test
    void deletedBannedAndUnknownAuthUsersCannotBeProvisioned() {
        UUID deleted = authUser(), banned = authUser(), unknown = UUID.randomUUID();
        jdbc.update("DELETE FROM public.profiles WHERE id IN (?, ?)", deleted, banned);
        jdbc.update("UPDATE auth.users SET deleted_at = now() WHERE id = ?", deleted);
        jdbc.update("UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = ?", banned);
        for (UUID user : new UUID[]{deleted, banned, unknown}) {
            assertEquals("CUSTOMER_PROFILE_NOT_FOUND", assertThrows(ApiException.class,
                    () -> readAs(user, user)).getCode());
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM public.profiles WHERE id = ?", Integer.class, user));
        }
    }

    @Test
    void oversizedUntrustedAuthMetadataCannotBreakProfileRecovery() {
        UUID owner = authUser();
        jdbc.update("DELETE FROM public.profiles WHERE id = ?", owner);
        jdbc.update("""
                UPDATE auth.users SET raw_user_meta_data =
                  jsonb_build_object('full_name', repeat('n', 200), 'phone', repeat('9', 50),
                                     'preferred_language', 'unsupported') WHERE id = ?
                """, owner);
        var restored = readAs(owner, owner);
        assertEquals(150, restored.fullName().length());
        assertEquals(30, restored.phone().length());
        assertEquals("my-MM", restored.preferredLanguage());
    }

    @Test
    void concurrentReadsRestoreOneProfileAndCannotCrossAuthenticatedOwners() throws Exception {
        UUID owner = authUser(), other = authUser();
        jdbc.update("DELETE FROM public.profiles WHERE id = ?", owner);
        CountDownLatch start = new CountDownLatch(1);
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> { assertTrue(start.await(10, TimeUnit.SECONDS)); return readAs(owner, owner); });
            var second = threads.submit(() -> { assertTrue(start.await(10, TimeUnit.SECONDS)); return readAs(owner, owner); });
            start.countDown();
            assertEquals(owner, first.get(15, TimeUnit.SECONDS).id());
            assertEquals(owner, second.get(15, TimeUnit.SECONDS).id());
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public.profiles WHERE id = ?", Integer.class, owner));
        assertEquals("AUTHENTICATED_USER_MISMATCH", assertThrows(ApiException.class,
                () -> readAs(other, owner)).getCode());
    }

    private UUID authUser() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO auth.users(id, email, raw_user_meta_data)
                VALUES (?, 'customer@example.test',
                  '{"full_name":" Auth name ","phone":" 0912345678 ","preferred_language":"en"}'::jsonb)
                """, id);
        return id;
    }

    private CustomerProfileResponse readAs(UUID identity, UUID requestedOwner) {
        Jwt token = Jwt.withTokenValue("local-test-only").header("alg", "RS256")
                .subject(identity.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(token, List.of()));
        try { return profiles.getMyProfile(requestedOwner); }
        finally { SecurityContextHolder.clearContext(); }
    }
}
