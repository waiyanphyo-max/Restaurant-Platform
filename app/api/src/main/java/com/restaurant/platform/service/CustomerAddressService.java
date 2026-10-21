package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerAddressRequest;
import com.restaurant.platform.dto.customer.CustomerAddressResponse;
import com.restaurant.platform.entity.CustomerAddress;
import com.restaurant.platform.repository.CustomerAddressRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CustomerAddressService {

    private final CustomerAddressRepository addressRepository;

    public CustomerAddressService(CustomerAddressRepository addressRepository) {
        this.addressRepository = addressRepository;
    }

    @Transactional(readOnly = true)
    public List<CustomerAddressResponse> list(UUID userId) {
        return addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CustomerAddressResponse create(UUID userId, CustomerAddressRequest request) {
        CustomerAddress address = new CustomerAddress();
        apply(address, request);
        boolean makeDefault = request.makeDefault()
                || addressRepository.findByUserIdAndIsDefaultTrue(userId).isEmpty();
        if (makeDefault) {
            addressRepository.clearDefaultForUser(userId);
        }
        address.setUserId(userId);
        address.setIsDefault(makeDefault);
        return toResponse(addressRepository.save(address));
    }

    @Transactional
    public CustomerAddressResponse update(
            UUID userId, UUID addressId, CustomerAddressRequest request) {
        CustomerAddress address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(this::addressNotFound);
        boolean wasDefault = Boolean.TRUE.equals(address.getIsDefault());
        apply(address, request);
        boolean makeDefault = request.makeDefault() || wasDefault
                || addressRepository.findByUserIdAndIsDefaultTrue(userId).isEmpty();
        if (makeDefault) {
            addressRepository.clearDefaultForUser(userId);
        }
        address.setIsDefault(makeDefault);
        return toResponse(addressRepository.save(address));
    }

    @Transactional
    public CustomerAddressResponse setDefault(UUID userId, UUID addressId) {
        CustomerAddress address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(this::addressNotFound);
        addressRepository.clearDefaultForUser(userId);
        address.setIsDefault(true);
        return toResponse(addressRepository.save(address));
    }

    @Transactional
    public void delete(UUID userId, UUID addressId) {
        CustomerAddress address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(this::addressNotFound);
        boolean wasDefault = Boolean.TRUE.equals(address.getIsDefault());
        addressRepository.delete(address);
        if (wasDefault) {
            List<CustomerAddress> remaining =
                    addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId);
            if (!remaining.isEmpty()) {
                CustomerAddress fallback = remaining.getFirst();
                addressRepository.clearDefaultForUser(userId);
                fallback.setIsDefault(true);
                addressRepository.save(fallback);
            }
        }
    }

    private void apply(CustomerAddress address, CustomerAddressRequest request) {
        if (request == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "ADDRESS_REQUIRED", "error.address.required");
        }
        address.setLabel(request.label().trim());
        address.setRecipientName(clean(request.recipientName()));
        address.setHouseNo(clean(request.houseNo()));
        address.setStreet(clean(request.street()));
        address.setWard(clean(request.ward()));
        address.setTownship(request.township().trim());
        address.setCity(request.city().trim());
        address.setLatitude(request.latitude());
        address.setLongitude(request.longitude());
        address.setDeliveryNote(clean(request.deliveryNote()));
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private CustomerAddressResponse toResponse(CustomerAddress address) {
        return new CustomerAddressResponse(
                address.getId(), address.getLabel(), address.getRecipientName(),
                address.getHouseNo(), address.getStreet(), address.getWard(),
                address.getTownship(), address.getCity(), address.getLatitude(),
                address.getLongitude(), address.getDeliveryNote(),
                Boolean.TRUE.equals(address.getIsDefault()),
                address.getCreatedAt(), address.getUpdatedAt());
    }

    private ApiException addressNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "CUSTOMER_ADDRESS_NOT_FOUND", "error.address.not-found");
    }
}
