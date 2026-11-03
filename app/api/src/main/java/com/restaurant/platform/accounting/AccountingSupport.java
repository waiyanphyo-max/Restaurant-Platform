package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Supplier;

/** Shared transaction, authorization and exact-value rules for financial domains. */
@Component
public class AccountingSupport {
    private final JdbcTemplate jdbc;
    private final RestaurantAuthorization authorization;
    private final RestaurantSettingsRepository settings;
    private final JsonMapper json = JsonMapper.builder()
            .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).findAndAddModules().build();

    public AccountingSupport(JdbcTemplate jdbc, RestaurantAuthorization authorization, RestaurantSettingsRepository settings) {
        this.jdbc = jdbc;
        this.authorization = authorization;
        this.settings = settings;
    }

    public UUID read(UUID restaurantId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.FINANCE_READ);
        return authorization.requireAuthenticatedUserId();
    }

    public UUID write(UUID restaurantId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.FINANCE_MANAGE);
        return authorization.requireAuthenticatedUserId();
    }

    public ZoneId zone(UUID restaurantId) {
        String timezone = settings.findById(restaurantId).orElseThrow(() -> conflict("RESTAURANT_SETTINGS_MISSING")).getTimezone();
        try {
            return ZoneId.of(timezone == null || timezone.isBlank() ? "Asia/Yangon" : timezone);
        } catch (DateTimeException e) {
            throw conflict("INVALID_RESTAURANT_TIMEZONE");
        }
    }

    public LocalDate today(UUID restaurantId) { return LocalDate.now(zone(restaurantId)); }

    public String currency(UUID restaurantId) {
        return settings.findById(restaurantId).orElseThrow(() -> conflict("RESTAURANT_SETTINGS_MISSING")).getCurrency();
    }

    public DateRange range(UUID restaurantId, LocalDate from, LocalDate to) {
        ZoneId zone = zone(restaurantId);
        LocalDate first = from == null ? (to == null ? LocalDate.now(zone) : to) : from;
        LocalDate last = to == null ? first : to;
        if (first.getYear() < 1900 || last.getYear() > 9998 || last.isBefore(first)
                || ChronoUnit.DAYS.between(first, last) > 365) throw invalid("INVALID_ACCOUNTING_DATE_RANGE");
        return new DateRange(first, last, first.atStartOfDay(zone).toOffsetDateTime(), last.plusDays(1).atStartOfDay(zone).toOffsetDateTime());
    }

    /** All cash-affecting writers and daily closing share this transaction lock. */
    public void lock(UUID restaurantId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Accounting writes require a transaction");
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, "accounting:" + restaurantId);
    }

    public void assertOpenDay(UUID restaurantId, LocalDate date) {
        if (date == null || date.isAfter(today(restaurantId))) throw invalid("INVALID_ACCOUNTING_POSTING_DATE");
        Boolean closed = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM public.accounting_cash_closings c
                WHERE c.restaurant_id=? AND c.closing_date >= ?
                AND NOT EXISTS (SELECT 1 FROM public.accounting_cash_closing_reversals r
                  WHERE r.restaurant_id=c.restaurant_id AND r.closing_id=c.id))
                """, Boolean.class, restaurantId, date);
        // Backdated cash must not change either the closed day or subsequent carry forwards.
        if (Boolean.TRUE.equals(closed)) throw conflict("CASH_DAY_ALREADY_CLOSED");
    }

    /** A retry must use the same operation, key and payload; failed writes leave no registry row. */
    public UUID once(UUID restaurantId, String operation, String key, Object payload, Supplier<UUID> action) {
        UUID actor = write(restaurantId);
        if (key == null || !key.matches("[A-Za-z0-9._:-]{1,120}")) throw invalid("IDEMPOTENCY_KEY_REQUIRED");
        lock(restaurantId);
        String hash = sha256(json.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8));
        var previous = jdbc.query("""
                SELECT request_hash,result_id FROM public.accounting_requests
                WHERE restaurant_id=? AND operation=? AND request_key=?
                """, (rs, n) -> new Previous(rs.getString(1), rs.getObject(2, UUID.class)), restaurantId, operation, key);
        if (!previous.isEmpty()) {
            if (!previous.getFirst().hash().equals(hash)) throw conflict("IDEMPOTENCY_KEY_REUSED");
            return previous.getFirst().id();
        }
        UUID id = action.get();
        jdbc.update("""
                INSERT INTO public.accounting_requests(restaurant_id,operation,request_key,request_hash,result_id,created_by)
                VALUES (?,?,?,?,?,?)
                """, restaurantId, operation, key, hash, id, actor);
        return id;
    }

    public void audit(UUID restaurantId, UUID actor, String entityType, UUID entityId, String action, String reason, Object detail) {
        jdbc.update("""
                INSERT INTO public.accounting_audit(restaurant_id,actor_id,entity_type,entity_id,action,reason,detail)
                VALUES (?,?,?,?,?,?,CAST(? AS jsonb))
                """, restaurantId, actor, entityType, entityId, action, reason, json.writeValueAsString(detail));
    }

    public static long whole(BigDecimal amount) {
        try { return amount.longValueExact(); }
        catch (ArithmeticException | NullPointerException e) { throw invalid("WHOLE_CURRENCY_AMOUNT_REQUIRED"); }
    }

    public static void page(int page, int size) {
        if (page < 0 || size < 1 || size > 200 || (long) page * size > Integer.MAX_VALUE) throw invalid("INVALID_ACCOUNTING_PAGE");
    }

    public static String csv(Object value) {
        String text = value == null ? "" : value.toString();
        String trimmed = text.stripLeading();
        if ((!trimmed.isEmpty() && "=+-@".indexOf(trimmed.charAt(0)) >= 0) || text.startsWith("\t") || text.startsWith("\r") || text.startsWith("\n")) text = "'" + text;
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }

    public static String sha256(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public static ApiException invalid(String code) { return new ApiException(HttpStatus.BAD_REQUEST, code, "error.accounting.invalid"); }
    public static ApiException conflict(String code) { return new ApiException(HttpStatus.CONFLICT, code, "error.accounting.conflict"); }
    public static ApiException missing(String code) { return new ApiException(HttpStatus.NOT_FOUND, code, "error.accounting.not-found"); }
    public record DateRange(LocalDate from, LocalDate to, OffsetDateTime start, OffsetDateTime end) { }
    public enum Chronology {
        NEWEST("DESC"), OLDEST("ASC");
        private final String direction;
        Chronology(String direction) { this.direction = direction; }
        public String direction() { return direction; }
    }
    private record Previous(String hash, UUID id) { }
}
