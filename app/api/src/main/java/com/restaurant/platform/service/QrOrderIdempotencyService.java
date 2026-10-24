package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CreateQrOrderRequest;
import com.restaurant.platform.security.TokenUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Transactional idempotency for public QR checkout. The stored response is
 * authenticated-encrypted because Common QR responses contain the customer's
 * queue tracking token; database rows must not store that credential in clear text.
 *
 * All methods participate in the caller's Spring transaction. If order creation
 * fails, the idempotency claim is rolled back with stock and order writes.
 */
@Service
public class QrOrderIdempotencyService {

    private static final int NONCE_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final Pattern VALID_KEY = Pattern.compile("[A-Za-z0-9._:-]{8,128}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final NamedParameterJdbcTemplate jdbc;
    private final JsonMapper jsonMapper;
    private final String encryptionKeyBase64;

    public QrOrderIdempotencyService(
            NamedParameterJdbcTemplate jdbc,
            JsonMapper jsonMapper,
            @Value("${app.idempotency.encryption-key:}") String encryptionKeyBase64) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
        this.encryptionKeyBase64 = encryptionKeyBase64 == null ? "" : encryptionKeyBase64.trim();
    }

    public Claim begin(UUID restaurantId, String operation, String rawKey, CreateQrOrderRequest request) {
        if (rawKey == null || rawKey.isBlank()) {
            return Claim.notUsed();
        }
        if (!VALID_KEY.matcher(rawKey.trim()).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_IDEMPOTENCY_KEY", "error.idempotency.invalid-key");
        }

        SecretKeySpec key = encryptionKey();
        String normalizedKey = rawKey.trim();
        String keyHash = TokenUtils.sha256(normalizedKey);
        String requestHash = fingerprint(restaurantId, operation, request);

        // Existing keys can be reused only after the 24-hour retention window.
        // ON CONFLICT waits for an in-flight transaction; it then either claims
        // a rolled-back key or observes the committed response from the first call.
        String claimSql = """
                INSERT INTO public.qr_order_idempotency
                    (restaurant_id, operation, idempotency_key_hash, request_hash,
                     status, created_at, expires_at)
                VALUES
                    (:restaurantId, :operation, :keyHash, :requestHash,
                     'IN_PROGRESS', now(), now() + interval '24 hours')
                ON CONFLICT (restaurant_id, operation, idempotency_key_hash)
                DO UPDATE SET
                    request_hash = EXCLUDED.request_hash,
                    response_ciphertext = NULL,
                    status = 'IN_PROGRESS',
                    created_at = now(),
                    expires_at = EXCLUDED.expires_at
                WHERE public.qr_order_idempotency.expires_at <= now()
                """;
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("restaurantId", restaurantId)
                .addValue("operation", operation)
                .addValue("keyHash", keyHash)
                .addValue("requestHash", requestHash);

        int inserted = jdbc.update(claimSql, params);
        if (inserted == 1) {
            return Claim.claimed(restaurantId, operation, keyHash, key);
        }

        Map<String, Object> existing = jdbc.queryForMap("""
                SELECT request_hash, status, response_ciphertext
                FROM public.qr_order_idempotency
                WHERE restaurant_id = :restaurantId
                  AND operation = :operation
                  AND idempotency_key_hash = :keyHash
                """, params);

        if (!requestHash.equals(existing.get("request_hash"))) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "IDEMPOTENCY_KEY_REUSED", "error.idempotency.key-reused");
        }

        String status = String.valueOf(existing.get("status"));
        Object ciphertextValue = existing.get("response_ciphertext");
        if ("COMPLETED".equals(status) && ciphertextValue instanceof byte[] ciphertext) {
            return Claim.replay(decryptResponse(
                    restaurantId, operation, keyHash, key, ciphertext));
        }

        throw new ApiException(HttpStatus.CONFLICT,
                "IDEMPOTENCY_REQUEST_IN_PROGRESS", "error.idempotency.request-in-progress");
    }

    public void complete(Claim claim, CreateOrderResponse response) {
        if (claim == null || !claim.claimed()) {
            return;
        }
        byte[] encryptedResponse = encryptResponse(
                claim.restaurantId(), claim.operation(), claim.keyHash(), claim.encryptionKey(), response);

        int updated = jdbc.update("""
                UPDATE public.qr_order_idempotency
                SET status = 'COMPLETED', response_ciphertext = :ciphertext
                WHERE restaurant_id = :restaurantId
                  AND operation = :operation
                  AND idempotency_key_hash = :keyHash
                  AND status = 'IN_PROGRESS'
                """, new MapSqlParameterSource()
                .addValue("ciphertext", encryptedResponse)
                .addValue("restaurantId", claim.restaurantId())
                .addValue("operation", claim.operation())
                .addValue("keyHash", claim.keyHash()));

        if (updated != 1) {
            throw new IllegalStateException("QR order idempotency claim was lost before completion");
        }
    }

    private String fingerprint(UUID restaurantId, String operation, CreateQrOrderRequest request) {
        try {
            byte[] json = jsonMapper.writeValueAsBytes(request);
            return TokenUtils.sha256(restaurantId + "\n" + operation + "\n"
                    + Base64.getEncoder().encodeToString(json));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not fingerprint QR checkout request", exception);
        }
    }

    private SecretKeySpec encryptionKey() {
        try {
            byte[] decoded = Base64.getDecoder().decode(encryptionKeyBase64);
            if (decoded.length != 32) {
                throw new IllegalArgumentException("Expected a 32-byte Base64 key");
            }
            return new SecretKeySpec(decoded, "AES");
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "IDEMPOTENCY_ENCRYPTION_NOT_CONFIGURED",
                    "error.idempotency.not-configured");
        }
    }

    private byte[] encryptResponse(
            UUID restaurantId, String operation, String keyHash,
            SecretKeySpec key, CreateOrderResponse response) {
        try {
            byte[] nonce = new byte[NONCE_LENGTH];
            RANDOM.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(aad(restaurantId, operation, keyHash));
            byte[] plaintext = jsonMapper.writeValueAsBytes(response);
            byte[] encrypted = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(nonce.length + encrypted.length)
                    .put(nonce).put(encrypted).array();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not encrypt QR idempotency response", exception);
        }
    }

    private CreateOrderResponse decryptResponse(
            UUID restaurantId, String operation, String keyHash,
            SecretKeySpec key, byte[] encryptedResponse) {
        try {
            if (encryptedResponse.length <= NONCE_LENGTH) {
                throw new IllegalArgumentException("Invalid encrypted response");
            }
            byte[] nonce = Arrays.copyOfRange(encryptedResponse, 0, NONCE_LENGTH);
            byte[] ciphertext = Arrays.copyOfRange(
                    encryptedResponse, NONCE_LENGTH, encryptedResponse.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(aad(restaurantId, operation, keyHash));
            byte[] plaintext = cipher.doFinal(ciphertext);
            return jsonMapper.readValue(plaintext, CreateOrderResponse.class);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "IDEMPOTENCY_RESPONSE_UNREADABLE",
                    "error.idempotency.response-unreadable");
        }
    }

    private byte[] aad(UUID restaurantId, String operation, String keyHash) {
        return (restaurantId + "\n" + operation + "\n" + keyHash)
                .getBytes(StandardCharsets.UTF_8);
    }

    public record Claim(
            boolean used,
            boolean claimed,
            UUID restaurantId,
            String operation,
            String keyHash,
            SecretKeySpec encryptionKey,
            CreateOrderResponse replayResponse) {

        static Claim notUsed() {
            return new Claim(false, false, null, null, null, null, null);
        }

        static Claim claimed(UUID restaurantId, String operation, String keyHash, SecretKeySpec key) {
            return new Claim(true, true, restaurantId, operation, keyHash, key, null);
        }

        static Claim replay(CreateOrderResponse response) {
            return new Claim(true, false, null, null, null, null, response);
        }
    }
}
