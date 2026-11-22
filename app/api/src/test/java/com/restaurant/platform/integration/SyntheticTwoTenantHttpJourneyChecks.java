package com.restaurant.platform.integration;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.restaurant.platform.RestaurantPlatformApplication;
import com.restaurant.platform.service.SupabaseAuthAdminClient;
import com.sun.net.httpserver.HttpServer;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.sql.DataSource;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * One connected, persisted API journey on the existing migrated disposable database.
 * Only Auth Admin identity lookup and the JWT issuer are synthetic. Production JWT
 * decoding, HTTP filters, membership authorization, controllers and transactions run.
 * No mailbox, password provider, phone, hosted Auth or installed-client acceptance is claimed.
 */
final class SyntheticTwoTenantHttpJourneyChecks {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ISSUER = "https://synthetic-auth.example.test/auth/v1";

    private final UUID admin = UUID.randomUUID();
    private final UUID ownerA = UUID.randomUUID();
    private final UUID ownerB = UUID.randomUUID();
    private final UUID managerA = UUID.randomUUID();
    private final UUID managerB = UUID.randomUUID();
    private final List<UUID> restaurants = new ArrayList<>();
    private final ECKey key;
    private final JdbcTemplate jdbc;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private String origin;
    private int requestCount;

    private SyntheticTwoTenantHttpJourneyChecks(DataSource source) throws Exception {
        jdbc = new JdbcTemplate(source);
        key = new ECKeyGenerator(Curve.P_256).keyID("synthetic-journey-key").generate();
    }

    static void verify(DataSource source) throws Exception {
        Path evidence = Path.of("target", "postgres-acceptance", "http-journey.json");
        Files.deleteIfExists(evidence);
        var checks = new SyntheticTwoTenantHttpJourneyChecks(source);
        checks.run(assertInstanceOf(DriverManagerDataSource.class, source));
        // Emit only after all assertions and task-owned fixture/server cleanup complete.
        checks.writeEvidence(evidence);
    }

    private void run(DriverManagerDataSource source) throws Exception {
        var auth = new SyntheticAuthBoundary(Map.of(
                ownerA, identity(ownerA, "owner-a"), ownerB, identity(ownerB, "owner-b")));
        HttpServer jwks = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        byte[] publicKeys = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
        jwks.createContext("/jwks", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, publicKeys.length);
            try (var body = exchange.getResponseBody()) { body.write(publicKeys); }
        });
        jwks.start();
        try {
            // The synthetic auth.users rows model preexisting verified provider identities only.
            // Restaurant membership is established by the actual provisioning/Owner APIs below.
            for (UUID user : List.of(admin, ownerA, ownerB, managerA, managerB)) {
                String email = auth.users.containsKey(user) ? auth.users.get(user).email() : user + "@example.test";
                jdbc.update("INSERT INTO auth.users(id,email) VALUES (?,?)", user, email);
            }
            try (var context = new SpringApplicationBuilder(JourneyApplication.class)
                    .initializers(application -> ((GenericApplicationContext) application).registerBean(
                            "syntheticAuthBoundary", SupabaseAuthAdminClient.class, () -> auth,
                            definition -> definition.setPrimary(true)))
                    .run("--server.address=127.0.0.1", "--server.port=0",
                            "--spring.datasource.url=" + source.getUrl(),
                            "--spring.datasource.username=" + source.getUsername(),
                            "--spring.datasource.password=" + source.getPassword(),
                            "--spring.datasource.hikari.maximum-pool-size=3",
                            "--spring.security.oauth2.resourceserver.jwt.issuer-uri=" + ISSUER,
                            "--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:"
                                    + jwks.getAddress().getPort() + "/jwks",
                            "--app.security.jwt.signing-algorithm=ES256",
                            "--app.security.platform-admin-user-ids=" + admin,
                            "--app.public-web-base-url=https://synthetic-guest.example.test",
                            "--app.supabase-admin.project-url=", "--app.supabase-admin.service-role-key=",
                            "--app.supabase-admin.invite-redirect-url=",
                            "--app.push.firebase.enabled=false",
                            "--app.idempotency.encryption-key=",
                            "--logging.level.org.springframework.web.servlet.DispatcherServlet=INFO")) {
                origin = "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port");
                journey();
                assertEquals(0, auth.invitations, "No real or synthetic invitation is sent");
                assertEquals(0, auth.recoveries, "No recovery email is sent");
            }
        } finally {
            client.close();
            jwks.stop(0);
            // These are only this invocation's disposable fixtures, never an existing tenant reset.
            for (UUID restaurant : restaurants) jdbc.update("DELETE FROM public.restaurants WHERE id=?", restaurant);
            for (UUID user : List.of(admin, ownerA, ownerB, managerA, managerB)) {
                jdbc.update("DELETE FROM auth.users WHERE id=?", user);
            }
        }
    }

    private void journey() throws Exception {
        UUID a = provision("a", ownerA, "MMK", "Asia/Yangon");
        String aPath = "/restaurants/" + a;
        String bootstrapA = "/platform/restaurants/" + a + "/bootstrap";
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_members WHERE user_id=?", Long.class, admin));
        assertEquals("OWNER", jdbc.queryForObject("SELECT role FROM public.restaurant_members WHERE restaurant_id=? AND user_id=?",
                String.class, a, ownerA));
        request("POST", aPath + "/members", ownerA, Map.of("userId", managerA, "role", "MANAGER"), 201);
        request("POST", "/platform/restaurants/" + a + "/branding", admin,
                palette(0, "#A51D22", "#FCEAE7", "#FFF8F0"), 200);

        var categoryRequest = step("a-category", "CATEGORY", Map.of("category", Map.of("name", "Synthetic A meals", "active", true)));
        var categoryReceipt = request("POST", bootstrapA + "/steps", admin, categoryRequest, 200);
        UUID categoryA = id(categoryReceipt, "resourceId");
        var replayReceipt = request("POST", bootstrapA + "/steps", admin, categoryRequest, 200);
        for (String field : List.of("operationKey", "kind", "resourceId", "result", "actorId")) {
            assertEquals(categoryReceipt.path(field), replayReceipt.path(field),
                    "Exact retry must preserve the committed receipt's " + field);
        }
        // PostgreSQL stores timestamptz at microsecond precision and normalizes offsets.
        // The replay must match persisted time; the initial in-memory response may retain nanoseconds.
        Instant storedReceiptTime = jdbc.queryForObject("""
                SELECT completed_at FROM public.restaurant_bootstrap_steps
                WHERE restaurant_id=? AND operation_key='a-category'
                """, OffsetDateTime.class, a).toInstant();
        Instant firstReceiptTime = OffsetDateTime.parse(categoryReceipt.path("completedAt").stringValue()).toInstant();
        Instant replayReceiptTime = OffsetDateTime.parse(replayReceipt.path("completedAt").stringValue()).toInstant();
        assertEquals(storedReceiptTime, replayReceiptTime, "Retry returns the database's committed timestamp");
        assertTrue(Math.abs(Duration.between(firstReceiptTime, storedReceiptTime).toNanos()) <= 1000,
                "Initial and persisted receipt times agree within PostgreSQL microsecond precision");
        error("POST", bootstrapA + "/steps", admin,
                step("a-category", "CATEGORY", Map.of("category", Map.of("name", "Different intent", "active", true))),
                409, "BOOTSTRAP_KEY_REUSED");
        UUID productA = resource(bootstrapA, "a-product", "PRODUCT", Map.of("currency", "MMK", "product",
                product(categoryA, "Synthetic A rice", 4500)));
        UUID variantA = resource(bootstrapA, "a-variant", "VARIANT", Map.of("currency", "MMK", "productId", productA,
                "variant", Map.of("name", "Large", "price", 6500, "available", true)));
        UUID groupA = resource(bootstrapA, "a-modifier", "MODIFIER_GROUP", Map.of("modifierGroup",
                Map.of("name", "Spice", "required", true, "minSelections", 1, "maxSelections", 1, "active", true)));
        error("POST", bootstrapA + "/steps", admin, step("a-incomplete", "COMPLETE_CATALOG", Map.of()),
                409, "BOOTSTRAP_REQUIRED_MODIFIERS_INCOMPLETE");
        UUID optionA = resource(bootstrapA, "a-option", "MODIFIER_OPTION", Map.of("currency", "MMK", "modifierGroupId", groupA,
                "modifierOption", Map.of("name", "Mild", "additionalPrice", 0, "available", true)));
        request("POST", bootstrapA + "/steps", admin,
                step("a-attach", "ATTACH_MODIFIER_GROUP", Map.of("productId", productA, "modifierGroupId", groupA)), 200);
        review(bootstrapA, "a", "MMK", "Asia/Yangon");
        var pending = request("GET", bootstrapA, admin, null, 200);
        assertFalse(pending.path("ownerOnboardingConfirmed").booleanValue());
        assertTrue(pending.path("blockers").toString().contains("OWNER_ACCOUNT_SETUP_PENDING"));
        error("POST", bootstrapA + "/steps", admin, step("a-blocked-handoff", "HANDOFF", Map.of()),
                409, "BOOTSTRAP_HANDOFF_BLOCKED");
        // Production onboarding checks signed fresh AMR password proof and locked DB Owner/account rows.
        var withoutPassword = token(ownerA, key, false, ISSUER, "authenticated", Instant.now().plusSeconds(300));
        assertEquals("OWNER_PASSWORD_PROOF_REQUIRED", response("POST", "/owner-onboarding/complete",
                withoutPassword, Map.of(), 403).path("code").stringValue());
        request("POST", "/owner-onboarding/complete", ownerA, Map.of(), 200);
        var ready = request("GET", bootstrapA, admin, null, 200);
        assertTrue(ready.path("handoffReady").booleanValue());
        assertEquals("PENDING", ready.path("photosStatus").stringValue());
        assertEquals("PENDING", ready.path("nativeBuildStatus").stringValue());
        request("POST", bootstrapA + "/steps", admin, step("a-handoff", "HANDOFF", Map.of()), 200);
        error("POST", bootstrapA + "/steps", admin,
                step("a-too-late", "CATEGORY", Map.of("category", Map.of("name", "Late", "active", true))),
                409, "BOOTSTRAP_HANDED_OFF");

        request("PUT", aPath + "/products/" + productA, ownerA, product(categoryA, "Synthetic A owner rice", 5100), 200);
        request("PUT", aPath + "/products/" + productA + "/variants/" + variantA, managerA,
                Map.of("name", "Large manager edit", "price", 6900, "available", true), 200);
        request("PUT", aPath + "/branding", managerA, palette(1, "#9B2226", "#FCEAE7", "#FFF8F0"), 200);
        var menuA = request("GET", "/public" + aPath + "/menu", null, null, 200);
        assertEquals(a.toString(), menuA.path("restaurantId").stringValue());
        assertEquals("MMK", menuA.path("currency").stringValue());
        var publicProduct = menuA.path("categories").get(0).path("products").get(0);
        assertEquals(productA.toString(), publicProduct.path("id").stringValue());
        assertEquals("Synthetic A owner rice", publicProduct.path("name").stringValue());
        assertEquals(5100L, publicProduct.path("price").longValue());
        assertEquals(variantA.toString(), publicProduct.path("variants").get(0).path("id").stringValue());
        assertEquals(6900L, publicProduct.path("variants").get(0).path("price").longValue());
        var publicGroup = publicProduct.path("modifierGroups").get(0);
        assertEquals(groupA.toString(), publicGroup.path("id").stringValue());
        assertTrue(publicGroup.path("required").booleanValue());
        assertEquals(optionA.toString(), publicGroup.path("options").get(0).path("id").stringValue());
        var publicBrand = request("GET", "/public" + aPath + "/branding", null, null, 200);
        assertEquals("#9B2226", publicBrand.path("palette").path("primaryColor").stringValue());
        assertFalse(publicBrand.has("configuration"));
        assertFalse(publicBrand.has("owners"));
        request("PUT", aPath + "/featured-product", ownerA, Map.of("productId", productA, "expectedRevision", 0), 200);
        error("PUT", aPath + "/featured-product", managerA, Map.of("productId", productA, "expectedRevision", 1),
                403, "INSUFFICIENT_RESTAURANT_PERMISSION");
        assertEquals(productA.toString(), request("GET", "/public" + aPath + "/menu", null, null, 200)
                .path("featuredProduct").path("productId").stringValue());

        UUID b = provision("b", ownerB, "THB", "Asia/Bangkok");
        String bPath = "/restaurants/" + b;
        String bootstrapB = "/platform/restaurants/" + b + "/bootstrap";
        request("POST", bPath + "/members", ownerB, Map.of("userId", managerB, "role", "MANAGER"), 201);
        request("POST", "/platform/restaurants/" + b + "/branding", admin,
                palette(0, "#123B70", "#DDEEFF", "#F4FAFF"), 200);
        UUID categoryB = resource(bootstrapB, "b-category", "CATEGORY",
                Map.of("category", Map.of("name", "Synthetic B bowls", "active", true)));
        UUID productB = resource(bootstrapB, "b-product", "PRODUCT",
                Map.of("currency", "THB", "product", product(categoryB, "Synthetic B pumpkin bowl", 125)));
        error("POST", bootstrapB + "/steps", admin, step("b-foreign-category", "PRODUCT",
                Map.of("currency", "THB", "product", product(categoryA, "Rejected foreign category", 1))),
                400, "INVALID_PRODUCT_CATEGORY");
        review(bootstrapB, "b", "THB", "Asia/Bangkok");
        request("POST", "/owner-onboarding/complete", ownerB, Map.of(), 200);
        request("POST", bootstrapB + "/steps", admin, step("b-handoff", "HANDOFF", Map.of()), 200);
        request("PUT", bPath + "/branding", managerB, palette(1, "#234D3C", "#E8EEDB", "#FFFFFF"), 200);
        request("PUT", bPath + "/products/" + productB, ownerB,
                product(categoryB, "Synthetic B independent bowl", 140), 200);

        error("GET", aPath + "/products", ownerB, null, 403, "INSUFFICIENT_RESTAURANT_PERMISSION");
        error("GET", bPath + "/members", ownerA, null, 403, "INSUFFICIENT_RESTAURANT_PERMISSION");
        error("GET", bootstrapA, ownerA, null, 403, "PLATFORM_ADMIN_REQUIRED");
        error("PUT", aPath + "/branding", ownerB, palette(2, "#123456", "#FFFFFF", "#FFFFFF"),
                403, "INSUFFICIENT_RESTAURANT_PERMISSION");
        error("PUT", bPath + "/products/" + productA, ownerB, product(categoryB, "Rejected foreign resource", 1),
                404, "PRODUCT_NOT_FOUND");
        error("PUT", bPath + "/featured-product", ownerB, Map.of("productId", productA, "expectedRevision", 0),
                404, "PRODUCT_NOT_FOUND");
        error("PUT", aPath + "/products/" + productA, ownerB, product(categoryA, "Rejected other tenant", 1),
                403, "INSUFFICIENT_RESTAURANT_PERMISSION");
        // Forged role claims cannot replace database membership (all generated tokens include role=OWNER).
        error("GET", aPath + "/products", managerB, null, 403, "INSUFFICIENT_RESTAURANT_PERMISSION");
        request("GET", aPath + "/products", null, null, 401);
        ECKey wrongKey = new ECKeyGenerator(Curve.P_256).keyID(key.getKeyID()).generate();
        response("GET", aPath + "/products", token(ownerA, wrongKey, true, ISSUER, "authenticated", Instant.now().plusSeconds(300)), null, 401);
        response("GET", aPath + "/products", token(ownerA, key, true, ISSUER, "wrong-audience", Instant.now().plusSeconds(300)), null, 401);
        response("GET", aPath + "/products", token(ownerA, key, true, "https://wrong.example.test", "authenticated", Instant.now().plusSeconds(300)), null, 401);
        response("GET", aPath + "/products", token(ownerA, key, true, ISSUER, "authenticated", Instant.now().minusSeconds(120)), null, 401);

        var menuB = request("GET", "/public" + bPath + "/menu", null, null, 200);
        assertEquals(b.toString(), menuB.path("restaurantId").stringValue());
        assertEquals("THB", menuB.path("currency").stringValue());
        assertEquals(1, menuB.path("categories").size());
        assertEquals(productB.toString(), menuB.path("categories").get(0).path("products").get(0).path("id").stringValue());
        assertEquals(140L, menuB.path("categories").get(0).path("products").get(0).path("price").longValue());
        assertEquals("NONE", menuB.path("featuredProduct").path("status").stringValue());
        assertEquals("#234D3C", request("GET", "/public" + bPath + "/branding", null, null, 200)
                .path("palette").path("primaryColor").stringValue());
        assertEquals("#9B2226", request("GET", "/public" + aPath + "/branding", null, null, 200)
                .path("palette").path("primaryColor").stringValue());
        assertTrue(request("GET", bootstrapA, admin, null, 200).path("handedOff").booleanValue());
        assertTrue(request("GET", bootstrapB, admin, null, 200).path("handedOff").booleanValue());
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.categories WHERE restaurant_id=?", Long.class, a));
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=? AND operation_key='a-category'", Long.class, a));
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_members WHERE user_id=?", Long.class, admin));
    }

    private UUID provision(String label, UUID owner, String currency, String timezone) throws Exception {
        var response = request("POST", "/platform/restaurants", admin,
                Map.of("ownerEmail", "owner-" + label + "@example.test", "ownerUserId", owner,
                        "restaurant", Map.of("name", "Synthetic HTTP " + label.toUpperCase(),
                                "slug", "synthetic-http-" + label + "-" + UUID.randomUUID(),
                                "township", "Synthetic Township", "city", "Synthetic City",
                                "currency", currency, "timezone", timezone)), 201);
        UUID restaurant = id(response.path("restaurant"), "id");
        restaurants.add(restaurant);
        assertEquals(owner.toString(), response.path("ownerUserId").stringValue());
        assertFalse(response.path("invitationSent").booleanValue());
        assertEquals("ACCEPTED", response.path("ownerInvitationStatus").stringValue());
        return restaurant;
    }

    private void review(String bootstrap, String label, String currency, String timezone) throws Exception {
        request("POST", bootstrap + "/steps", admin, step(label + "-complete", "COMPLETE_CATALOG", Map.of()), 200);
        request("POST", bootstrap + "/steps", admin, step(label + "-ordering", "ORDERING_SETTINGS",
                Map.of("settings", Map.of("currency", currency, "timezone", timezone, "minimumOrder", 0,
                        "defaultDeliveryFee", 0, "acceptsOrders", true, "allowQrOrder", true,
                        "allowDelivery", false, "allowTakeaway", true))), 200);
    }

    private UUID resource(String bootstrap, String operation, String kind, Map<String, Object> fields) throws Exception {
        return id(request("POST", bootstrap + "/steps", admin, step(operation, kind, fields), 200), "resourceId");
    }

    private JsonNode request(String method, String path, UUID actor, Object body, int status) throws Exception {
        return response(method, path, actor == null ? null
                : token(actor, key, true, ISSUER, "authenticated", Instant.now().plusSeconds(300)), body, status);
    }

    private void error(String method, String path, UUID actor, Object body, int status, String code) throws Exception {
        assertEquals(code, request(method, path, actor, body, status).path("code").stringValue(), method + " " + path);
    }

    private JsonNode response(String method, String path, String bearer, Object body, int status) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(origin + "/api/v1" + path)).timeout(Duration.ofSeconds(30))
                .header("Accept", "application/json");
        if (bearer != null) request.header("Authorization", "Bearer " + bearer);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
        var response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        requestCount++;
        // Never include request credentials or response body (which may contain a capability) in assertion logs.
        assertEquals(status, response.statusCode(), method + " " + path);
        return response.body().isBlank() ? JSON.nullNode() : JSON.readTree(response.body());
    }

    private void writeEvidence(Path evidence) throws Exception {
        var principal = jdbc.queryForMap("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("schemaVersion", 1);
        result.put("status", "PASS");
        result.put("serverVersionNum", jdbc.queryForObject("SHOW server_version_num", Integer.class));
        result.put("httpRequests", requestCount);
        result.put("phases", List.of("PLATFORM_PROVISIONING_A_B", "OWNER_AND_MANAGER_MEMBERSHIP",
                "RUNTIME_BRANDING", "CATALOG_VARIANT_REQUIRED_MODIFIER", "BOOTSTRAP_RECEIPT_RETRY_AND_CONFLICT",
                "OWNER_PASSWORD_AMR_PREREQUISITE", "OPERATIONS_HANDOFF_A_B", "OWNER_MANAGER_CATALOG_PALETTE_UPDATES",
                "PUBLIC_PERSISTED_MENU_AND_BRANDING", "OWNER_ONLY_FEATURED", "CROSS_TENANT_READ_WRITE_REFERENCE_DENIAL",
                "SIGNED_JWT_SIGNATURE_ISSUER_AUDIENCE_EXPIRY_VALIDATION"));
        result.put("identityScope", "One invocation's synthetic A/B users and returned restaurant/catalog UUIDs reused across all phases");
        result.put("syntheticExternalBoundaries", List.of("Supabase Auth Admin exact-UUID identity lookup",
                "Ephemeral loopback ES256 JWKS issuer and signed fresh-password AMR claim"));
        result.put("databasePrincipal", Map.of("superuser", principal.get("rolsuper"),
                "bypassRls", principal.get("rolbypassrls"),
                "limitation", "Journey fixture principal is separate from restricted-principal and hosted-role acceptance"));
        result.put("invitationCount", 0);
        result.put("recoveryEmailCount", 0);
        result.put("cleanup", "PASS");
        result.put("checkout", "NOT RUN");
        result.put("nativeDevice", "NOT RUN");
        result.put("hostedProviderLifecycle", "NOT RUN");
        Files.createDirectories(evidence.getParent());
        Files.writeString(evidence, JSON.writerWithDefaultPrettyPrinter().writeValueAsString(result), StandardCharsets.UTF_8);
    }

    private static Map<String, Object> step(String operation, String kind, Map<String, Object> fields) {
        var request = new java.util.LinkedHashMap<String, Object>(fields);
        request.put("operationKey", operation); request.put("kind", kind);
        return request;
    }

    private static Map<String, Object> product(UUID category, String name, long price) {
        return Map.of("categoryId", category, "name", name, "price", price, "trackStock", false, "available", true);
    }

    private static Map<String, Object> palette(long revision, String primary, String secondary, String background) {
        return Map.of("expectedRevision", revision, "palette", Map.of("primaryColor", primary,
                "secondaryColor", secondary, "backgroundColor", background));
    }

    private static UUID id(JsonNode node, String field) { return UUID.fromString(node.path(field).stringValue()); }

    private String token(UUID subject, ECKey signingKey, boolean password, String issuer, String audience, Instant expiry) throws Exception {
        Instant now = Instant.now();
        var claims = new JWTClaimsSet.Builder().issuer(issuer).subject(subject.toString()).audience(audience)
                .issueTime(Date.from(now.minusSeconds(180))).expirationTime(Date.from(expiry))
                .claim("role", "OWNER");
        if (password) claims.claim("amr", List.of(Map.of("method", "password", "timestamp", now.getEpochSecond())));
        var token = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(signingKey.getKeyID()).build(), claims.build());
        token.sign(new ECDSASigner(signingKey));
        return token.serialize();
    }

    private static SupabaseAuthAdminClient.AuthUser identity(UUID id, String label) {
        return new SupabaseAuthAdminClient.AuthUser(id, label + "@example.test", OffsetDateTime.now().minusDays(1),
                null, OffsetDateTime.now(), null, null);
    }

    /** Provider boundary is explicit; accidental email/invitation use fails before network access. */
    private static final class SyntheticAuthBoundary extends SupabaseAuthAdminClient {
        private final Map<UUID, AuthUser> users;
        private int invitations;
        private int recoveries;
        SyntheticAuthBoundary(Map<UUID, AuthUser> users) { super("", "", ""); this.users = users; }
        @Override public AuthUser getUserById(UUID id) {
            return java.util.Objects.requireNonNull(users.get(id), "Only exact synthetic owner identities are supported");
        }
        @Override public AuthUser inviteByEmail(String email, String fullName) {
            invitations++; throw new AssertionError("Invitations are outside synthetic journey acceptance");
        }
        @Override public void requestRecoveryEmail(String email) {
            recoveries++; throw new AssertionError("Recovery email is outside synthetic journey acceptance");
        }
    }

    /** Same production component packages; excludes test-only MVC probes/configurations on the test classpath. */
    @TestConfiguration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    @EntityScan("com.restaurant.platform.entity")
    @EnableJpaRepositories("com.restaurant.platform.repository")
    @ComponentScan(basePackages = "com.restaurant.platform", excludeFilters = {
            @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = RestaurantPlatformApplication.class),
            @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*Test.*")})
    static class JourneyApplication { }
}
