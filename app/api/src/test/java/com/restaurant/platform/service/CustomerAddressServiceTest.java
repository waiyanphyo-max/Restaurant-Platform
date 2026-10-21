package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerAddressRequest;
import com.restaurant.platform.entity.CustomerAddress;
import com.restaurant.platform.repository.CustomerAddressRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CustomerAddressServiceTest {

    private CustomerAddressRepository repository;
    private CustomerAddressService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID addressId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repository = mock(CustomerAddressRepository.class);
        service = new CustomerAddressService(repository);
    }

    @Test
    void firstAddressBecomesDefaultAutomatically() {
        when(repository.findByUserIdAndIsDefaultTrue(userId)).thenReturn(Optional.empty());
        when(repository.save(any(CustomerAddress.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(userId, request(false));

        assertTrue(response.isDefault());
        verify(repository).clearDefaultForUser(userId);
        var captor = org.mockito.ArgumentCaptor.forClass(CustomerAddress.class);
        verify(repository).save(captor.capture());
        assertEquals(userId, captor.getValue().getUserId());
        assertTrue(captor.getValue().getIsDefault());
    }

    @Test
    void addressCanBeCreatedAsNonDefaultWhenDefaultAlreadyExists() {
        CustomerAddress existingDefault = new CustomerAddress();
        existingDefault.setUserId(userId);
        existingDefault.setIsDefault(true);
        when(repository.findByUserIdAndIsDefaultTrue(userId))
                .thenReturn(Optional.of(existingDefault));
        when(repository.save(any(CustomerAddress.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(userId, request(false));

        assertFalse(response.isDefault());
        verify(repository, never()).clearDefaultForUser(userId);
    }

    @Test
    void updateCannotReadOrModifyAnotherUsersAddress() {
        when(repository.findByIdAndUserId(addressId, userId)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.update(userId, addressId, request(true)));

        assertEquals("CUSTOMER_ADDRESS_NOT_FOUND", error.getCode());
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verify(repository, never()).save(any(CustomerAddress.class));
    }

    @Test
    void setDefaultClearsOtherDefaultsAndScopesAddressToOwner() {
        CustomerAddress address = new CustomerAddress();
        address.setId(addressId);
        address.setUserId(userId);
        address.setIsDefault(false);
        when(repository.findByIdAndUserId(addressId, userId)).thenReturn(Optional.of(address));
        when(repository.save(any(CustomerAddress.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.setDefault(userId, addressId);

        assertTrue(response.isDefault());
        verify(repository).clearDefaultForUser(userId);
        verify(repository).save(address);
    }

    @Test
    void deletingDefaultPromotesAnotherAddress() {
        CustomerAddress toDelete = new CustomerAddress();
        toDelete.setId(addressId);
        toDelete.setUserId(userId);
        toDelete.setIsDefault(true);
        CustomerAddress fallback = new CustomerAddress();
        fallback.setId(UUID.randomUUID());
        fallback.setUserId(userId);
        fallback.setIsDefault(false);
        when(repository.findByIdAndUserId(addressId, userId)).thenReturn(Optional.of(toDelete));
        when(repository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId))
                .thenReturn(List.of(fallback));
        when(repository.save(any(CustomerAddress.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.delete(userId, addressId);

        verify(repository).delete(toDelete);
        verify(repository).clearDefaultForUser(userId);
        assertTrue(fallback.getIsDefault());
        verify(repository).save(fallback);
    }

    private CustomerAddressRequest request(boolean makeDefault) {
        return new CustomerAddressRequest(
                "Home", "Test Person", "12", "Main Road", "Ward 1",
                "Township", "City", null, null, null, makeDefault);
    }
}
