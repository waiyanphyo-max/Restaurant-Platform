package com.restaurant.platform.controller;

import com.restaurant.platform.common.GeoCoordinates;
import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.dto.delivery.AssignedDeliveryDetailDto;
import com.restaurant.platform.dto.delivery.DeliveryTaskDto;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.service.AssignedDeliveryService;
import com.restaurant.platform.service.DeliveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {AssignedDeliveryController.class, DeliveryController.class}, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class})
class AssignedDeliveryControllerHttpTest {
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID deliveryId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final String base = "/api/v1/restaurants/" + restaurantId + "/deliveries";
    private final String assignedRoute = base + "/mine/" + deliveryId;
    private final String legacyRoute = base + "/" + deliveryId;

    @Autowired private MockMvc mvc;
    @MockitoBean private AssignedDeliveryService service;
    @MockitoBean private DeliveryService deliveryService;
    @MockitoBean(name = "restaurantAuthorization") private RestaurantAuthorization authorization;
    @MockitoBean private JwtDecoder decoder;

    @Test
    void assignedDetailReturnsNumericCoordinatesWithoutCaching() throws Exception {
        var pickup = new AssignedDeliveryDetailDto.Pickup("Restaurant", "Pickup address", null, null);
        var destination = new GeoCoordinates(BigDecimal.ZERO, BigDecimal.valueOf(96.125));
        when(service.getDetail(restaurantId, deliveryId))
                .thenReturn(new AssignedDeliveryDetailDto(task(), pickup, destination, List.of(), true));

        mvc.perform(get(assignedRoute).with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.task.id").value(deliveryId.toString()))
                .andExpect(jsonPath("$.task.deliveryAddress").value("Confirmed address"))
                .andExpect(jsonPath("$.pickup.latitude").hasJsonPath())
                .andExpect(jsonPath("$.pickup.latitude").value(nullValue()))
                .andExpect(jsonPath("$.destination.latitude").isNumber())
                .andExpect(jsonPath("$.destination.latitude").value(0))
                .andExpect(jsonPath("$.destination.longitude").value(96.125))
                .andExpect(jsonPath("$.cashCollectionRequired").value(true));
    }

    @Test
    void expiredTokenCannotAccessTheDetailService() throws Exception {
        when(decoder.decode("expired-test-token")).thenThrow(new JwtValidationException(
                "Expired", List.of(new OAuth2Error("invalid_token"))));

        mvc.perform(get(assignedRoute).header(HttpHeaders.AUTHORIZATION, "Bearer expired-test-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.destination").doesNotExist());
        verifyNoInteractions(service);
    }

    @Test
    void legacyDetailRemainsFlatAndDisallowsCaching() throws Exception {
        when(deliveryService.getDelivery(restaurantId, deliveryId)).thenReturn(task());

        mvc.perform(get(legacyRoute).with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.id").value(deliveryId.toString()))
                .andExpect(jsonPath("$.destination").doesNotExist());
    }

    @Test
    void statusPatchParsesTheOptionalOffsetRevision() throws Exception {
        var timestamp = OffsetDateTime.parse("2026-11-04T11:00:00.123456+07:00");
        var request = new UpdateDeliveryStatusRequest("PICKED_UP", null, "Pickup note", null, timestamp);
        when(authorization.requireAuthenticatedUserId()).thenReturn(userId);
        when(authorization.hasPermission(restaurantId, RestaurantPermission.DELIVERY_STATUS_UPDATE)).thenReturn(true);

        mvc.perform(patch(legacyRoute + "/status").with(jwt().jwt(token -> token.subject(userId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"PICKED_UP","note":"Pickup note","expectedUpdatedAt":"2026-11-04T11:00:00.123456+07:00"}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        verify(deliveryService).updateDeliveryStatus(eq(restaurantId), eq(deliveryId), eq(userId),
                argThat(actual -> request.status().equals(actual.status())
                        && request.note().equals(actual.note())
                        && timestamp.isEqual(actual.expectedUpdatedAt())));
    }

    private DeliveryTaskDto task() {
        return new DeliveryTaskDto(deliveryId, UUID.randomUUID(), "ORD-101", "READY", "ASSIGNED",
                userId, "Recipient", "Test phone", "Confirmed address", null,
                1000L, null, null, null, null, null, null);
    }
}
