package com.restaurant.platform.repository;

import com.restaurant.platform.entity.CustomerAddress;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

/** Customer address lookups are always scoped to the authenticated owner ID. */
public interface CustomerAddressRepository extends JpaRepository<CustomerAddress, UUID> {
    List<CustomerAddress> findByUserIdOrderByIsDefaultDescCreatedAtDesc(UUID userId);

    Optional<CustomerAddress> findByUserIdAndIsDefaultTrue(UUID userId);

    Optional<CustomerAddress> findByIdAndUserId(UUID id, UUID userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("update CustomerAddress a set a.isDefault = false where a.userId = :userId")
    int clearDefaultForUser(@Param("userId") UUID userId);
}
