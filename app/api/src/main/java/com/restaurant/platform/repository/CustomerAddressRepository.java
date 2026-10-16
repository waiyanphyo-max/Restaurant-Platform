package com.restaurant.platform.repository;

import com.restaurant.platform.entity.CustomerAddress;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Spring Data repository for customer_addresses. */
public interface CustomerAddressRepository extends JpaRepository<CustomerAddress, UUID> {
    List<CustomerAddress> findByUserIdOrderByIsDefaultDescCreatedAtDesc(UUID userId);
    Optional<CustomerAddress> findByUserIdAndIsDefaultTrue(UUID userId);
}
