package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.customer.CustomerAddressRequest;
import com.restaurant.platform.dto.customer.CustomerAddressResponse;
import com.restaurant.platform.entity.CustomerAddress;
import com.restaurant.platform.repository.CustomerAddressRepository;
import com.restaurant.platform.service.CustomerAddressService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
@SpringBootTest(classes = CustomerAddressLocalPostgresTest.DatabaseApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=${ACCOUNTING_TEST_DATABASE_URL}",
        "spring.datasource.username=postgres",
        "spring.datasource.password="
})
class CustomerAddressLocalPostgresTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = OAuth2ResourceServerAutoConfiguration.class)
    @EntityScan(basePackageClasses = CustomerAddress.class)
    @EnableJpaRepositories(basePackageClasses = CustomerAddressRepository.class)
    @Import(CustomerAddressService.class)
    static class DatabaseApplication { }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private CustomerAddressService addresses;

    @Test
    void simultaneousFirstSavesAndDefaultUpdatesPreserveOneDefaultAndOwnerScope() throws Exception {
        UUID owner = UUID.randomUUID(), other = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES (?), (?)", owner, other);
        var foreignAddress = addresses.create(other, request("Other", false));

        var saved = race(() -> addresses.create(owner, request("Home", false)),
                () -> addresses.create(owner, request("Work", false)));
        assertEquals(1L, saved.stream().filter(CustomerAddressResponse::isDefault).count());
        assertEquals(2, addresses.list(owner).size());

        race(() -> addresses.update(owner, saved.getFirst().id(), request("Updated Home", true)),
                () -> addresses.setDefault(owner, saved.getLast().id()));
        var current = addresses.list(owner);
        assertEquals(1L, current.stream().filter(CustomerAddressResponse::isDefault).count());
        assertTrue(current.stream().anyMatch(address -> address.label().equals("Updated Home")));
        assertEquals("CUSTOMER_ADDRESS_NOT_FOUND", assertThrows(ApiException.class,
                () -> addresses.setDefault(owner, foreignAddress.id())).getCode());
        assertEquals(List.of(foreignAddress.id()), addresses.list(other).stream().map(CustomerAddressResponse::id).toList());
        assertTrue(addresses.list(other).getFirst().isDefault());

        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                INSERT INTO public.customer_addresses(user_id, township, city, is_default)
                VALUES (?, 'Tamwe', 'Yangon', true)
                """, owner));

        var defaultAddress = current.stream().filter(CustomerAddressResponse::isDefault).findFirst().orElseThrow();
        addresses.delete(owner, defaultAddress.id());
        var remaining = addresses.list(owner);
        assertEquals(1, remaining.size());
        assertTrue(remaining.getFirst().isDefault());
    }

    private static List<CustomerAddressResponse> race(Callable<CustomerAddressResponse> first,
                                                      Callable<CustomerAddressResponse> second) throws Exception {
        var start = new CountDownLatch(1);
        try (var threads = Executors.newFixedThreadPool(2)) {
            var a = threads.submit(() -> { assertTrue(start.await(10, TimeUnit.SECONDS)); return first.call(); });
            var b = threads.submit(() -> { assertTrue(start.await(10, TimeUnit.SECONDS)); return second.call(); });
            start.countDown();
            return List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
        }
    }

    private static CustomerAddressRequest request(String label, boolean makeDefault) {
        return new CustomerAddressRequest(label, null, null, null, null, "Tamwe", "Yangon", null, null, null, makeDefault);
    }
}
