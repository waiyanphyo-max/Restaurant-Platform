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
    private final GeographicLocationService locations;

    public CustomerAddressService(CustomerAddressRepository addressRepository, GeographicLocationService locations) {
        this.addressRepository = addressRepository;
        this.locations = locations;
    }

    @Transactional(readOnly = true)
    public List<CustomerAddressResponse> list(UUID userId) {
        return addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CustomerAddressResponse create(UUID userId, CustomerAddressRequest request) {
        addressRepository.lockOwner(userId);
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
        addressRepository.lockOwner(userId);
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
        addressRepository.lockOwner(userId);
        CustomerAddress address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(this::addressNotFound);
        addressRepository.clearDefaultForUser(userId);
        address.setIsDefault(true);
        return toResponse(addressRepository.save(address));
    }

    @Transactional
    public void delete(UUID userId, UUID addressId) {
        addressRepository.lockOwner(userId);
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
        var location = locations.resolve(request.regionId(),request.districtId(),request.townshipId(),request.city(),request.township());
        address.setRegionId(location.regionId());
        address.setDistrictId(location.districtId());
        address.setTownshipId(location.townshipId());
        address.setRegionName(location.regionName());
        address.setDistrictName(location.districtName());
        address.setTownship(location.townshipName());
        address.setCity(location.regionName());
        String phone = clean(request.recipientPhone());
        if (phone != null && DeliveryRecipientPhone.normalize(phone) == null)
            throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_DELIVERY_PHONE","error.delivery.invalid-phone");
        address.setRecipientPhone(phone == null ? null : DeliveryRecipientPhone.normalize(phone));
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
                address.getCreatedAt(), address.getUpdatedAt(),address.getRegionId(),address.getDistrictId(),address.getTownshipId(),
                address.getRegionName(),address.getDistrictName(),address.getRecipientPhone());
    }

    private ApiException addressNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "CUSTOMER_ADDRESS_NOT_FOUND", "error.address.not-found");
    }
}
