
package com.restaurant.platform.security;

import java.util.UUID;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.repository.RestaurantMemberRepository;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;

@Component("restaurantAuthorization")
@RequiredArgsConstructor
public class RestaurantAuthorization {

    private final RestaurantMemberRepository memberRepository;

    /**
     * Returns false if the current user is not authenticated
     * or does not have the requested permission.
     */
    public boolean hasPermission(
            UUID restaurantId,
            RestaurantPermission permission
    ) {
        UUID userId = getCurrentUserIdOrNull();

        return userId != null
                && hasPermission(restaurantId, userId, permission);
    }

    /**
     * Throws 401 if the current user is not authenticated.
     */
    public UUID requireAuthenticatedUserId() {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || "anonymousUser".equals(authentication.getPrincipal())) {

            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED",
                    "error.authentication.required"
            );
        }

        String authenticatedUserName = authentication.getName();

        if (authenticatedUserName == null
                || authenticatedUserName.isBlank()) {

            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "INVALID_AUTHENTICATED_USER_ID",
                    "error.authentication.invalid_user_id"
            );
        }

        try {
            return UUID.fromString(authenticatedUserName);
        } catch (IllegalArgumentException ex) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "INVALID_AUTHENTICATED_USER_ID",
                    "error.authentication.invalid_user_id"
            );
        }
    }

    /**
     * Ensures the supplied user ID matches the authenticated user.
     */
    public void requireAuthenticatedUserMatches(UUID userId) {
        UUID authenticatedUserId = requireAuthenticatedUserId();

        if (userId == null || !authenticatedUserId.equals(userId)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "AUTHENTICATED_USER_MISMATCH",
                    "error.authorization.user_mismatch"
            );
        }
    }

    /**
     * Throws 401 when unauthenticated and 403 when permission is missing.
     */
    public void requirePermission(
            UUID restaurantId,
            RestaurantPermission permission
    ) {
        UUID userId = requireAuthenticatedUserId();

        if (!hasPermission(restaurantId, userId, permission)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "INSUFFICIENT_RESTAURANT_PERMISSION",
                    "error.authorization.permission_denied"
            );
        }
    }

    private boolean hasPermission(
            UUID restaurantId,
            UUID userId,
            RestaurantPermission permission
    ) {
        if (restaurantId == null
                || userId == null
                || permission == null) {
            return false;
        }

        return memberRepository
                .findByRestaurantIdAndUserId(restaurantId, userId)
                .map(member -> member.getRole().allows(permission))
                .orElse(false);
    }

    private UUID getCurrentUserIdOrNull() {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return null;
        }

        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException | NullPointerException ex) {
            return null;
        }
    }

    public boolean canReadOrders(UUID restaurantId) {
        return hasPermission(
                restaurantId,
                RestaurantPermission.ORDER_READ
        );
    }

    public boolean canCreateOrders(UUID restaurantId) {
        return hasPermission(
                restaurantId,
                RestaurantPermission.ORDER_CREATE
        );
    }

    public boolean canUpdateOrderStatus(UUID restaurantId) {
        return hasPermission(
                restaurantId,
                RestaurantPermission.ORDER_STATUS_UPDATE
        );
    }

    public boolean canManageMenu(UUID restaurantId) {
        return hasPermission(
                restaurantId,
                RestaurantPermission.MENU_MANAGE
        );
    }
}
