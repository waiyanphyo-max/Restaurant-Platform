package com.restaurant.platform.integration;

import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantRole;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.EnumMap;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Runs the actual assignment eligibility queries against a disposable Supabase-shaped database. */
public final class DeliveryEligibilityDatabaseChecks {
    private DeliveryEligibilityDatabaseChecks() { }

    public static void verify(DataSource source, EntityManagerFactory factory) {
        var jdbc = new JdbcTemplate(source);
        UUID restaurant = restaurant(jdbc), foreignRestaurant = restaurant(jdbc);
        var enabled = new EnumMap<RestaurantRole, UUID>(RestaurantRole.class);
        for (var role : RestaurantRole.values()) {
            UUID user = user(jdbc);
            enabled.put(role, user);
            membership(jdbc, restaurant, user, role);
        }
        UUID banned = user(jdbc), deleted = user(jdbc), foreign = user(jdbc), removed = user(jdbc);
        membership(jdbc, restaurant, banned, RestaurantRole.DELIVERY_DRIVER);
        membership(jdbc, restaurant, deleted, RestaurantRole.STAFF);
        membership(jdbc, foreignRestaurant, foreign, RestaurantRole.DELIVERY_DRIVER);
        membership(jdbc, restaurant, removed, RestaurantRole.STAFF);
        jdbc.update("UPDATE auth.users SET banned_until = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE id = ?", banned);
        jdbc.update("UPDATE auth.users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", deleted);
        jdbc.update("DELETE FROM public.restaurant_members WHERE restaurant_id = ? AND user_id = ?", restaurant, removed);
        jdbc.update("UPDATE auth.users SET banned_until = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = ?",
                enabled.get(RestaurantRole.DELIVERY_DRIVER));

        try (var entityManager = factory.createEntityManager()) {
            var members = new JpaRepositoryFactory(entityManager).getRepository(RestaurantMemberRepository.class);
            var options = members.findEligibleDeliveryMembers(restaurant).stream().map(RestaurantMember::getUserId).toList();
            assertEquals(enabled.size(), options.size());
            assertTrue(options.containsAll(enabled.values()));
            assertEquals(List.of(enabled.get(RestaurantRole.DELIVERY_DRIVER)), members.findEligibleDeliveryDrivers(restaurant)
                    .stream().map(RestaurantMember::getUserId).toList());
            var transaction = entityManager.getTransaction();
            transaction.begin();
            try {
                for (var entry : enabled.entrySet()) {
                    assertEquals(entry.getKey(), members.findEligibleDeliveryMemberForUpdate(restaurant, entry.getValue())
                            .orElseThrow().getRole());
                }
                for (UUID user : List.of(banned, deleted, foreign, removed)) {
                    assertTrue(members.findEligibleDeliveryMemberForUpdate(restaurant, user).isEmpty());
                }
            } finally {
                transaction.rollback();
            }
        }
    }

    private static UUID restaurant(JdbcTemplate jdbc) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES(?,'Delivery test',?,'Bahan','Yangon')",
                id, "delivery-" + id);
        return id;
    }

    private static UUID user(JdbcTemplate jdbc) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES(?)", id);
        return id;
    }

    private static void membership(JdbcTemplate jdbc, UUID restaurant, UUID user, RestaurantRole role) {
        jdbc.update("INSERT INTO public.restaurant_members(restaurant_id,user_id,role) VALUES(?,?,?)",
                restaurant, user, role.name());
    }
}
