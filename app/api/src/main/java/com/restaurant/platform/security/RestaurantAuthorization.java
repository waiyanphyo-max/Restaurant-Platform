package com.restaurant.platform.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.restaurant.platform.repository.RestaurantMemberRepository;

import lombok.RequiredArgsConstructor;

@Component("restaurantAuthorization")
@RequiredArgsConstructor
public class RestaurantAuthorization {

    private final RestaurantMemberRepository memberRepository;

    public boolean hasPermission(
            UUID restaurantId,
            RestaurantPermission permission) {

        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return false;
        }

        UUID userId;

        try {
            // JWT authentication ရဲ့ name က ပုံမှန်အားဖြင့် sub ဖြစ်တယ်။
            userId = UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException ex) {
            return false;
        }

        return memberRepository
                .findByRestaurantIdAndUserId(restaurantId, userId)
                .map(member -> member.getRole().allows(permission))
                .orElse(false);
    }

    public boolean canReadOrders(UUID restaurantId) {
        return hasPermission(
                restaurantId, RestaurantPermission.ORDER_READ);
    }

    public boolean canCreateOrders(UUID restaurantId) {
        return hasPermission(
                restaurantId, RestaurantPermission.ORDER_CREATE);
    }

    public boolean canUpdateOrderStatus(UUID restaurantId) {
        return hasPermission(
                restaurantId, RestaurantPermission.ORDER_STATUS_UPDATE);
    }

    public boolean canManageMenu(UUID restaurantId) {
        return hasPermission(
                restaurantId, RestaurantPermission.MENU_MANAGE);
    }
}