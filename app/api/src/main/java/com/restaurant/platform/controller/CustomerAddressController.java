package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerAddressRequest;
import com.restaurant.platform.dto.customer.CustomerAddressResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerAddressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
    public List<CustomerAddressResponse> listMyAddresses() {
        return addressService.list(authorization.requireAuthenticatedUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerAddressResponse createAddress(
            @Valid @RequestBody CustomerAddressRequest request) {
        return addressService.create(
                authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/{addressId}")
    public CustomerAddressResponse updateAddress(
            @PathVariable UUID addressId,
            @Valid @RequestBody CustomerAddressRequest request) {
        return addressService.update(
                authorization.requireAuthenticatedUserId(), addressId, request);
    }

    @PatchMapping("/{addressId}/default")
    public CustomerAddressResponse setDefaultAddress(
            @PathVariable UUID addressId) {
        return addressService.setDefault(
                authorization.requireAuthenticatedUserId(), addressId);
    }

    @DeleteMapping("/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(@PathVariable UUID addressId) {
        addressService.delete(
                authorization.requireAuthenticatedUserId(), addressId);
    }
}
