package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.entity.CustomerAddress;
import com.restaurant.platform.repository.CustomerAddressRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerAddressService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real filter, controller, JWT identity helper, validation and address service; no live database needed. */
@WebMvcTest(controllers = CustomerAddressController.class, properties = {
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"
})
@Import({SecurityConfig.class, ApiSecurityErrorHandler.class, LocaleConfig.class,
        RestaurantAuthorization.class, CustomerAddressService.class})
class CustomerAddressControllerHttpTest {
    private static final String BASE = "/api/v1/customer/addresses";
    private final UUID owner = UUID.randomUUID();
    private final UUID otherCustomer = UUID.randomUUID();
    private final UUID addressId = UUID.randomUUID();

    @Autowired private MockMvc mvc;
    @MockitoBean private JwtDecoder decoder;
    @MockitoBean private CustomerAddressRepository addresses;
    @MockitoBean private RestaurantMemberRepository memberships;
    @MockitoBean private DeliveryRepository deliveries;

    @BeforeEach
    void saveReturnsPersistedEntity() {
        when(addresses.save(any(CustomerAddress.class))).thenAnswer(invocation -> {
            CustomerAddress address = invocation.getArgument(0);
            if (address.getId() == null) address.setId(addressId);
            return address;
        });
    }

    @Test
    void everyAddressOperationRequiresAuthentication() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content(body("16.8", "96.1")))
                .andExpect(status().isUnauthorized());
        mvc.perform(put(BASE + "/" + addressId).contentType(MediaType.APPLICATION_JSON)
                        .content(body("16.8", "96.1"))).andExpect(status().isUnauthorized());
        mvc.perform(patch(BASE + "/" + addressId + "/default")).andExpect(status().isUnauthorized());
        mvc.perform(delete(BASE + "/" + addressId)).andExpect(status().isUnauthorized());
        verifyNoInteractions(addresses, memberships, deliveries);
    }

    @Test
    void ordinaryCustomerCanSaveAndRetrieveConfirmedHomePointWithoutStaffMembership() throws Exception {
        mvc.perform(post(BASE).with(jwt().jwt(token -> token.subject(owner.toString())).authorities())
                        .contentType(MediaType.APPLICATION_JSON).content(body("16.8123456", "96.1234567")))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.label").value("Home"))
                .andExpect(jsonPath("$.isDefault").value(true))
                .andExpect(jsonPath("$.latitude").value(16.8123456))
                .andExpect(jsonPath("$.longitude").value(96.1234567))
                .andExpect(jsonPath("$.userId").doesNotExist());

        var captor = org.mockito.ArgumentCaptor.forClass(CustomerAddress.class);
        verify(addresses).save(captor.capture());
        CustomerAddress saved = captor.getValue();
        assertEquals(owner, saved.getUserId());
        assertEquals(new BigDecimal("16.8123456"), saved.getLatitude());
        when(addresses.findByUserIdOrderByIsDefaultDescCreatedAtDesc(owner)).thenReturn(List.of(saved));

        mvc.perform(get(BASE).with(jwt().jwt(token -> token.subject(owner.toString())).authorities()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$[0].id").value(addressId.toString()))
                .andExpect(jsonPath("$[0].longitude").value(96.1234567));
        verifyNoInteractions(memberships, deliveries);
    }

    @Test
    void ownedAddressCanBeUpdatedWithoutChangingItsOwnerOrProfile() throws Exception {
        CustomerAddress address = ownedAddress();
        when(addresses.findByIdAndUserId(addressId, owner)).thenReturn(Optional.of(address));

        mvc.perform(put(BASE + "/" + addressId).with(jwt().jwt(token -> token.subject(owner.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(body("0", "-180")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latitude").value(0))
                .andExpect(jsonPath("$.longitude").value(-180))
                .andExpect(jsonPath("$.isDefault").value(true));
        assertEquals(owner, address.getUserId());
        verify(addresses).findByIdAndUserId(addressId, owner);
        verifyNoInteractions(memberships, deliveries);
    }

    @Test
    void anotherCustomerCannotUpdateDeleteOrSetDefaultOnOwnersAddress() throws Exception {
        when(addresses.findByIdAndUserId(addressId, otherCustomer)).thenReturn(Optional.empty());
        var identity = jwt().jwt(token -> token.subject(otherCustomer.toString()));

        mvc.perform(put(BASE + "/" + addressId).with(identity).contentType(MediaType.APPLICATION_JSON)
                        .content(body("16.8", "96.1")))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("CUSTOMER_ADDRESS_NOT_FOUND"));
        mvc.perform(patch(BASE + "/" + addressId + "/default").with(identity))
                .andExpect(status().isNotFound());
        mvc.perform(delete(BASE + "/" + addressId).with(identity)).andExpect(status().isNotFound());

        verify(addresses, never()).save(any());
        verify(addresses, never()).delete(any(CustomerAddress.class));
        verify(addresses, never()).clearDefaultForUser(any());
    }

    @Test
    void listUsesJwtSubjectEvenWhenAnotherCustomerIsSuppliedAsQueryOrHeader() throws Exception {
        when(addresses.findByUserIdOrderByIsDefaultDescCreatedAtDesc(otherCustomer)).thenReturn(List.of());
        mvc.perform(get(BASE).with(jwt().jwt(token -> token.subject(otherCustomer.toString())))
                        .param("userId", owner.toString()).param("customerId", owner.toString())
                        .header("X-Restaurant-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk()).andExpect(content().json("[]"));
        verify(addresses).findByUserIdOrderByIsDefaultDescCreatedAtDesc(otherCustomer);
        verify(addresses, never()).findByUserIdOrderByIsDefaultDescCreatedAtDesc(owner);
        verifyNoInteractions(memberships, deliveries);
    }

    @Test
    void clientSuppliedOwnerAndRestaurantFieldsCannotReassignAnAddress() throws Exception {
        String payload = body("16", "96").replace("\"label\":\"Home\"",
                "\"label\":\"Home\",\"userId\":\"" + otherCustomer
                        + "\",\"customerId\":\"" + otherCustomer
                        + "\",\"restaurantId\":\"" + UUID.randomUUID() + "\"");
        var result = mvc.perform(post(BASE).with(jwt().jwt(token -> token.subject(owner.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(payload)).andReturn();
        // Unknown JSON fields may be rejected by stricter deployments, or ignored by Jackson.
        // In either configuration they cannot select the persisted owner or restaurant.
        if (result.getResponse().getStatus() == 400) {
            verify(addresses, never()).save(any());
        } else {
            assertEquals(201, result.getResponse().getStatus());
            verify(addresses).save(org.mockito.ArgumentMatchers.argThat(address -> owner.equals(address.getUserId())));
        }
        verifyNoInteractions(memberships, deliveries);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "91,96", "-91,96", "16,181", "16,-181", "16,null", "null,96"
    })
    void rejectsOutOfRangeAndIncompletePointsBeforePersistence(String point) throws Exception {
        String[] axes = point.split(",");
        mvc.perform(post(BASE).with(jwt().jwt(token -> token.subject(owner.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(body(axes[0], axes[1])))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        verify(addresses, never()).save(any());
    }

    @Test
    void acceptsLegacyManualAddressWithNoCoordinates() throws Exception {
        mvc.perform(post(BASE).with(jwt().jwt(token -> token.subject(owner.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(body("null", "null")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.latitude").isEmpty())
                .andExpect(jsonPath("$.longitude").isEmpty());
    }

    @Test
    void rejectsBlankRequiredFieldsAndOversizedAddressDetails() throws Exception {
        String invalid = body("16", "96").replace("\"Township\"", "\" \"")
                .replace("\"Main Road\"", "\"" + "x".repeat(101) + "\"");
        mvc.perform(post(BASE).with(jwt().jwt(token -> token.subject(owner.toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        verify(addresses, never()).save(any());
    }

    private CustomerAddress ownedAddress() {
        CustomerAddress address = new CustomerAddress();
        address.setId(addressId);
        address.setUserId(owner);
        address.setIsDefault(true);
        return address;
    }

    private String body(String latitude, String longitude) {
        return """
                {"label":"Home","recipientName":"Customer","houseNo":"12, Floor 2",
                 "street":"Main Road","ward":"Ward 1","township":"Township","city":"City",
                 "latitude":%s,"longitude":%s,"deliveryNote":"Near the gate","makeDefault":true}
                """.formatted(latitude, longitude);
    }
}
