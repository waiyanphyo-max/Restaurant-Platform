package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CreateQrOrderRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class QrOrderIdempotencyServiceTest {

    private static final String ENCRYPTION_KEY =
            Base64.getEncoder().encodeToString(new byte[32]);
    private final UUID restaurantId = UUID.randomUUID();
    private NamedParameterJdbcTemplate jdbc;
    private JsonMapper mapper;
    private QrOrderIdempotencyService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        mapper = JsonMapper.builder().build();
        service = new QrOrderIdempotencyService(jdbc, mapper, ENCRYPTION_KEY);
    }

    @Test
    void sameKeyAndRequestReplaysOriginalResponseIncludingTrackingToken() {
        CreateQrOrderRequest request = new CreateQrOrderRequest("qr-secret", List.of());
        CreateOrderResponse expected = responseWithTrackingToken("one-time-tracking-token");
        when(jdbc.update(startsWith("INSERT INTO public.qr_order_idempotency"),
                any(MapSqlParameterSource.class))).thenReturn(1);
        when(jdbc.update(startsWith("UPDATE public.qr_order_idempotency"),
                any(MapSqlParameterSource.class))).thenReturn(1);

        var firstClaim = service.begin(restaurantId, "COMMON_QR", "checkout-key-0001", request);
        assertTrue(firstClaim.claimed());
        service.complete(firstClaim, expected);

        var updateParams = org.mockito.ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).update(startsWith("UPDATE public.qr_order_idempotency"), updateParams.capture());
        byte[] encryptedResponse = (byte[]) updateParams.getValue().getValue("ciphertext");
        assertFalse(new String(encryptedResponse, StandardCharsets.UTF_8)
                .contains("one-time-tracking-token"));

        String requestHash = (String) findInsertRequestHash("checkout-key-0001");
        when(jdbc.update(startsWith("INSERT INTO public.qr_order_idempotency"),
                any(MapSqlParameterSource.class))).thenReturn(0);
        when(jdbc.queryForMap(startsWith("SELECT request_hash, status, response_ciphertext"),
                any(MapSqlParameterSource.class))).thenReturn(Map.of(
                        "request_hash", requestHash,
                        "status", "COMPLETED",
                        "response_ciphertext", encryptedResponse));

        var replay = service.begin(restaurantId, "COMMON_QR", "checkout-key-0001", request);
        assertNotNull(replay.replayResponse());
        assertEquals(expected, replay.replayResponse());
        verify(jdbc, times(2)).update(startsWith("INSERT INTO public.qr_order_idempotency"),
                any(MapSqlParameterSource.class));
    }

    @Test
    void sameKeyCannotBeReusedForDifferentPayload() {
        CreateQrOrderRequest original = new CreateQrOrderRequest("qr-secret", List.of());
        CreateQrOrderRequest modified = new CreateQrOrderRequest("different-qr-secret", List.of());
        when(jdbc.update(startsWith("INSERT INTO public.qr_order_idempotency"),
                any(MapSqlParameterSource.class))).thenReturn(1, 0);
        when(jdbc.update(startsWith("UPDATE public.qr_order_idempotency"),
                any(MapSqlParameterSource.class))).thenReturn(1);

        var initial = service.begin(restaurantId, "COMMON_QR", "checkout-key-0002", original);
        service.complete(initial, responseWithTrackingToken("token"));

        String requestHash = (String) findInsertRequestHash("checkout-key-0002");
        when(jdbc.queryForMap(startsWith("SELECT request_hash, status, response_ciphertext"),
                any(MapSqlParameterSource.class))).thenReturn(Map.of(
                        "request_hash", requestHash,
                        "status", "COMPLETED",
                        "response_ciphertext", new byte[]{1, 2, 3}));

        ApiException exception = assertThrows(ApiException.class, () ->
                service.begin(restaurantId, "COMMON_QR", "checkout-key-0002", modified));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        assertEquals("IDEMPOTENCY_KEY_REUSED", exception.getCode());
    }

    @Test
    void suppliedKeyIsRejectedWhenEncryptionSecretIsNotConfigured() {
        QrOrderIdempotencyService missingSecret =
                new QrOrderIdempotencyService(jdbc, mapper, "");
        ApiException exception = assertThrows(ApiException.class, () ->
                missingSecret.begin(restaurantId, "COMMON_QR",
                        "checkout-key-0003",
                        new CreateQrOrderRequest("qr-secret", List.of())));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.getStatus());
        assertEquals("IDEMPOTENCY_ENCRYPTION_NOT_CONFIGURED", exception.getCode());
        verifyNoInteractions(jdbc);
    }

    @Test
    void missingKeyKeepsLegacyCheckoutBehaviorWithoutDatabaseWrites() {
        var claim = service.begin(restaurantId, "TABLE_QR", null,
                new CreateQrOrderRequest("table-secret", List.of()));
        assertFalse(claim.used());
        assertFalse(claim.claimed());
        verifyNoInteractions(jdbc);
    }

    private CreateOrderResponse responseWithTrackingToken(String token) {
        return new CreateOrderResponse(
                UUID.randomUUID(), "ORD-20261024-ABCD1234",
                "TAKEAWAY", "COMMON_QR", "PENDING", "MMK",
                3500L, 0L, 0L, 3500L,
                new CreateOrderResponse.QueueInfo(
                        UUID.randomUUID(), 12, "012", "WAITING", token));
    }

    private Object findInsertRequestHash(String key) {
        var captor = org.mockito.ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc, atLeastOnce()).update(
                startsWith("INSERT INTO public.qr_order_idempotency"), captor.capture());
        return captor.getAllValues().stream()
                .filter(params -> ((String) params.getValue("keyHash")) != null)
                .findFirst()
                .orElseThrow()
                .getValue("requestHash");
    }
}
