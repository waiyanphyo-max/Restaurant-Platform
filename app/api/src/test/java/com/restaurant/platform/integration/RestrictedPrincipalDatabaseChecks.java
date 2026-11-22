package com.restaurant.platform.integration;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Fixture-only database capability checks. No production grants or policies are changed.
 * These private tables intentionally have no RLS policies: a trusted Spring principal
 * needs ownership or BYPASSRLS as well as explicit object grants. This test does not
 * claim that BYPASSRLS enforces tenant isolation; the HTTP journey checks that boundary.
 */
final class RestrictedPrincipalDatabaseChecks {
    private static final List<String> TABLES = List.of(
            "restaurant_runtime_branding", "restaurant_bootstrap_steps", "restaurant_featured_product");

    private RestrictedPrincipalDatabaseChecks() { }

    static void verify(DataSource source) throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        String server = "uxi13a_server_" + suffix;
        String probe = "uxi13a_probe_" + suffix;
        UUID first = UUID.randomUUID(), second = UUID.randomUUID();
        UUID category = UUID.randomUUID(), product = UUID.randomUUID(), foreignProduct = UUID.randomUUID();
        String version;
        try (Connection connection = source.getConnection()) {
            connection.setAutoCommit(false);
            try {
                version = scalar(connection, "SHOW server_version_num");
                execute(connection, "CREATE ROLE " + server
                        + " NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS");
                execute(connection, "CREATE ROLE " + probe
                        + " NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
                for (String role : List.of(server, probe)) {
                    execute(connection, "GRANT USAGE ON SCHEMA public TO " + role);
                    execute(connection, "GRANT SELECT, INSERT, UPDATE ON public.restaurant_runtime_branding, "
                            + "public.restaurant_featured_product TO " + role);
                    execute(connection, "GRANT SELECT, INSERT ON public.restaurant_bootstrap_steps TO " + role);
                    assertEquals("false,false,false,false,false", scalar(connection,
                            "SELECT concat_ws(',',rolsuper::text,rolcreatedb::text,rolcreaterole::text,rolinherit::text,rolcanlogin::text)"
                                    + " FROM pg_roles WHERE rolname='" + role + "'"));
                    assertEquals("0", scalar(connection,
                            "SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='" + role + "')"));
                    assertEquals("0", scalar(connection,
                            "SELECT count(*) FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname='" + role + "')"));
                }
                for (String table : TABLES) {
                    assertEquals("true", scalar(connection,
                            "SELECT relrowsecurity::text FROM pg_class WHERE oid='public." + table + "'::regclass"));
                    assertEquals("0", scalar(connection,
                            "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='" + table + "'"));
                }
                execute(connection, "INSERT INTO public.restaurants(id,name,slug,township,city) VALUES "
                        + "('" + first + "','Principal A','principal-a-" + suffix + "','Bahan','Yangon'),"
                        + "('" + second + "','Principal B','principal-b-" + suffix + "','Bahan','Yangon')");
                execute(connection, "INSERT INTO public.categories(id,restaurant_id,name) VALUES "
                        + "('" + category + "','" + first + "','Meals')");
                execute(connection, "INSERT INTO public.products(id,restaurant_id,category_id,name,price) VALUES "
                        + "('" + product + "','" + first + "','" + category + "','Meal A',1000)");
                UUID otherCategory = UUID.randomUUID();
                execute(connection, "INSERT INTO public.categories(id,restaurant_id,name) VALUES "
                        + "('" + otherCategory + "','" + second + "','Other meals')");
                execute(connection, "INSERT INTO public.products(id,restaurant_id,category_id,name,price) VALUES "
                        + "('" + foreignProduct + "','" + second + "','" + otherCategory + "','Meal B',2000)");

                execute(connection, "SET LOCAL ROLE " + server);
                assertEquals("true", scalar(connection, "SELECT rolbypassrls::text FROM pg_roles WHERE rolname=current_user"));
                execute(connection, paletteInsert(first));
                execute(connection, "UPDATE public.restaurant_runtime_branding SET primary_color='#245887',revision=2 "
                        + "WHERE restaurant_id='" + first + "'");
                assertEquals("#245887", scalar(connection,
                        "SELECT primary_color FROM public.restaurant_runtime_branding WHERE restaurant_id='" + first + "'"));
                execute(connection, "INSERT INTO public.restaurant_bootstrap_steps"
                        + "(restaurant_id,operation_key,kind,request_hash,result,actor_id,step_index) VALUES "
                        + "('" + first + "','principal-check','CATEGORY','" + "a".repeat(64) + "','{}','" + UUID.randomUUID() + "',1)");
                assertEquals("1", scalar(connection,
                        "SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id='" + first + "'"));
                execute(connection, "INSERT INTO public.restaurant_featured_product(restaurant_id,product_id,revision) VALUES "
                        + "('" + first + "','" + product + "',1)");
                expectState(connection, "23503", "UPDATE public.restaurant_featured_product SET product_id='"
                        + foreignProduct + "' WHERE restaurant_id='" + first + "'");
                assertEquals(product.toString(), scalar(connection,
                        "SELECT product_id FROM public.restaurant_featured_product WHERE restaurant_id='" + first + "'"));
                execute(connection, "UPDATE public.restaurant_featured_product SET product_id=NULL,revision=2 WHERE restaurant_id='" + first + "'");
                expectState(connection, "42501", "UPDATE public.restaurant_bootstrap_steps SET result='{}' WHERE restaurant_id='" + first + "'");
                for (String table : List.of("public.restaurant_settings", "public.orders", "public.accounting_purchases", "auth.users")) {
                    expectState(connection, "42501", "SELECT * FROM " + table + " LIMIT 1");
                }
                expectState(connection, "42501", "TRUNCATE public.restaurant_runtime_branding");

                execute(connection, "RESET ROLE");
                execute(connection, "SET LOCAL ROLE " + probe);
                assertEquals("false", scalar(connection, "SELECT rolbypassrls::text FROM pg_roles WHERE rolname=current_user"));
                for (String table : TABLES) {
                    assertEquals("0", scalar(connection, "SELECT count(*) FROM public." + table),
                            "Explicit SELECT grants must not bypass default-deny RLS on " + table);
                }
                expectState(connection, "42501", paletteInsert(second));
                assertEquals("0", scalar(connection,
                        "WITH changed AS (UPDATE public.restaurant_featured_product SET revision=3 RETURNING 1) SELECT count(*) FROM changed"));

                execute(connection, "RESET ROLE");
                for (String role : List.of("anon", "authenticated", "service_role")) {
                    execute(connection, "SET LOCAL ROLE " + role);
                    for (String table : TABLES) {
                        expectState(connection, "42501", "SELECT * FROM public." + table + " LIMIT 1");
                        expectState(connection, "42501", "DELETE FROM public." + table);
                    }
                    expectState(connection, "42501", paletteInsert(second));
                    execute(connection, "RESET ROLE");
                }
            } finally {
                // Roles, grants, rows and all attempted writes exist only in this transaction.
                connection.rollback();
            }
            assertEquals("0", scalar(connection,
                    "SELECT count(*) FROM pg_roles WHERE rolname IN ('" + server + "','" + probe + "')"));
        }
        Path output = Path.of("target", "postgres-acceptance", "restricted-principal.json");
        Files.createDirectories(output.getParent());
        Files.writeString(output, """
                {
                  "status": "PASS",
                  "serverVersionNum": %s,
                  "trustedServer": {"superuser": false, "ownsTables": false, "bypassRls": true,
                    "grants": {"restaurant_runtime_branding": ["SELECT","INSERT","UPDATE"],
                      "restaurant_bootstrap_steps": ["SELECT","INSERT"],
                      "restaurant_featured_product": ["SELECT","INSERT","UPDATE"]}},
                  "nonBypassProbe": "same object grants; RLS hides reads and denies writes",
                  "clientRoles": {"anon": "DENIED", "authenticated": "DENIED", "service_role": "DENIED"},
                  "foreignFeaturedReference": "DENIED:23503",
                  "unrelatedPrivateTables": "DENIED:42501",
                  "fixtureRolesAndGrantsRolledBack": true,
                  "limitations": ["Synthetic capability fixture only; not the hosted Spring principal",
                    "BYPASSRLS does not enforce tenant isolation; actual HTTP service authorization is tested separately",
                    "This is the focused branding/bootstrap/Featured grant subset, not a complete deployment grant manifest"]
                }
                """.formatted(version));
    }

    private static String paletteInsert(UUID restaurant) {
        return "INSERT INTO public.restaurant_runtime_branding(restaurant_id,primary_color,secondary_color,background_color,revision) VALUES ('"
                + restaurant + "','#A51D22','#FCEAE7','#FFF8F0',1)";
    }

    private static void expectState(Connection connection, String state, String sql) throws SQLException {
        var savepoint = connection.setSavepoint();
        try {
            SQLException exception = assertThrows(SQLException.class, () -> execute(connection, sql));
            assertEquals(state, exception.getSQLState(), "Expected database boundary for " + sql.split(" ")[0]);
        } finally {
            connection.rollback(savepoint);
            connection.releaseSavepoint(savepoint);
        }
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) { statement.execute(sql); }
    }

    private static String scalar(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            assertTrue(result.next());
            return result.getString(1);
        }
    }
}
