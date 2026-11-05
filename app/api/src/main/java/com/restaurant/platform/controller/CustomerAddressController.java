package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerAddressRequest;
import com.restaurant.platform.dto.customer.CustomerAddressResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerAddressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/addresses")
@RequiredArgsConstructor
public class CustomerAddressController {

    private final CustomerAddressService addressService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public ResponseEntity<List<CustomerAddressResponse>> listMyAddresses() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(addressService.list(authorization.requireAuthenticatedUserId()));
    }

    @PostMapping
    public ResponseEntity<CustomerAddressResponse> createAddress(
            @Valid @RequestBody CustomerAddressRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(addressService.create(authorization.requireAuthenticatedUserId(), request));
    }

    @PutMapping("/{addressId}")
    public ResponseEntity<CustomerAddressResponse> updateAddress(
            @PathVariable UUID addressId,
            @Valid @RequestBody CustomerAddressRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(addressService.update(authorization.requireAuthenticatedUserId(), addressId, request));
    }

    @PatchMapping("/{addressId}/default")
    public ResponseEntity<CustomerAddressResponse> setDefaultAddress(
            @PathVariable UUID addressId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(addressService.setDefault(authorization.requireAuthenticatedUserId(), addressId));
    }

    @DeleteMapping("/{addressId}")
    public ResponseEntity<Void> deleteAddress(@PathVariable UUID addressId) {
        addressService.delete(
                authorization.requireAuthenticatedUserId(), addressId);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
