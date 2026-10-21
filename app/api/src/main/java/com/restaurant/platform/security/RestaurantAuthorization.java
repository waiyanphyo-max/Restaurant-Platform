package com.restaurant.platform.security;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;

import lombok.RequiredArgsConstructor;

@Component("restaurantAuthorization")
@RequiredArgsConstructor
public class RestaurantAuthorization {

    private final RestaurantMemberRepository memberRepository;
    private final DeliveryRepository deliveryRepository;
    private final OrderRepository orderRepository;

    /**
     * Returns false if the current user is not authenticated or lacks the
     * requested permission in this exact restaurant.
     */
    public boolean hasPermission(UUID restaurantId, RestaurantPermission permission) {
        UUID userId = getCurrentUserIdOrNull();
        return userId != null && hasPermission(restaurantId, userId, permission);
    }

    /**
     * Returns the UUID subject from Spring Security's validated Supabase JWT.
     * Other Authentication implementations are not treated as proof of identity.
     */
    public UUID requireAuthenticatedUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (isUnauthenticated(authentication)) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED",
                    "error.authentication.required");
        }

        if (!(authentication instanceof JwtAuthenticationToken jwtAuthentication)) {
            throw invalidAuthenticatedUserId();
        }

        try {
            return UUID.fromString(jwtAuthentication.getToken().getSubject());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw invalidAuthenticatedUserId();
        }
    }

    /**
     * Ensures the supplied user ID matches the identity established by Spring Security.
     */
    public void requireAuthenticatedUserMatches(UUID userId) {
        UUID authenticatedUserId = requireAuthenticatedUserId();

        if (userId == null || !authenticatedUserId.equals(userId)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "AUTHENTICATED_USER_MISMATCH",
                    "error.authorization.user_mismatch");
        }
    }

    /**
     * Throws 401 when unauthenticated and 403 when the user does not have
     * the requested permission for the target restaurant.
     */
    public void requirePermission(UUID restaurantId, RestaurantPermission permission) {
        UUID userId = requireAuthenticatedUserId();

        if (!hasPermission(restaurantId, userId, permission)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "INSUFFICIENT_RESTAURANT_PERMISSION",
                    "error.authorization.permission_denied");
        }
    }

    /**
     * Checks delivery access without allowing a driver to enumerate all deliveries
     * in a restaurant. A DELIVERY_DRIVER must be the assigned driver; other
     * restaurant members need DELIVERY_READ and restaurant-scoped order ownership.
     */
    public boolean canAccessDelivery(UUID restaurantId, UUID deliveryId) {
        UUID userId = getCurrentUserIdOrNull();
        if (restaurantId == null || deliveryId == null || userId == null) {
            return false;
        }

        RestaurantMember member = memberRepository
                .findByRestaurantIdAndUserId(restaurantId, userId)
                .orElse(null);

        if (member == null || member.getRole() == null
                || !member.getRole().allows(RestaurantPermission.DELIVERY_READ)) {
            return false;
        }

        if (member.getRole() == RestaurantRole.DELIVERY_DRIVER) {
            return deliveryRepository
                    .findByIdAndDriverUserId(deliveryId, userId)
                    .map(delivery -> orderBelongsToRestaurant(delivery, restaurantId))
                    .orElse(false);
        }

        return deliveryRepository.findById(deliveryId)
                .map(delivery -> orderBelongsToRestaurant(delivery, restaurantId))
                .orElse(false);
    }

    /**
     * Use for delivery detail/status operations that must not reveal whether a
     * delivery exists outside the caller's permitted scope.
     */
    public void requireDeliveryAccess(UUID restaurantId, UUID deliveryId) {
        requireAuthenticatedUserId();

        if (!canAccessDelivery(restaurantId, deliveryId)) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND,
                    "DELIVERY_NOT_FOUND",
                    "error.delivery.not-found");
        }
    }

    public boolean canUpdateDeliveryStatus(UUID restaurantId, UUID deliveryId) {
        UUID userId = getCurrentUserIdOrNull();
        return userId != null
                && hasPermission(restaurantId, userId, RestaurantPermission.DELIVERY_STATUS_UPDATE)
                && canAccessDelivery(restaurantId, deliveryId);
    }

    public boolean canAssignDelivery(UUID restaurantId, UUID deliveryId) {
        UUID userId = getCurrentUserIdOrNull();
        return userId != null
                && hasPermission(restaurantId, userId, RestaurantPermission.DELIVERY_ASSIGN)
                && deliveryRepository.findById(deliveryId)
                        .map(delivery -> orderBelongsToRestaurant(delivery, restaurantId))
                        .orElse(false);
    }

    private boolean orderBelongsToRestaurant(Delivery delivery, UUID restaurantId) {
        return delivery.getOrderId() != null
                && orderRepository.findByIdAndRestaurantId(
                        delivery.getOrderId(), restaurantId).isPresent();
    }

    private boolean hasPermission(
            UUID restaurantId,
            UUID userId,
            RestaurantPermission permission) {
        if (restaurantId == null || userId == null || permission == null) {
            return false;
        }

        return memberRepository.findByRestaurantIdAndUserId(restaurantId, userId)
                .map(member -> member.getRole() != null && member.getRole().allows(permission))
                .orElse(false);
    }

    private UUID getCurrentUserIdOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (isUnauthenticated(authentication)
                || !(authentication instanceof JwtAuthenticationToken jwtAuthentication)) {
            return null;
        }

        try {
            return UUID.fromString(jwtAuthentication.getToken().getSubject());
        } catch (IllegalArgumentException | NullPointerException exception) {
            return null;
        }
    }

    private boolean isUnauthenticated(Authentication authentication) {
        return authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || "anonymousUser".equals(authentication.getPrincipal());
    }

    private ApiException invalidAuthenticatedUserId() {
        return new ApiException(
                HttpStatus.UNAUTHORIZED,
                "INVALID_AUTHENTICATED_USER_ID",
                "error.authentication.invalid_user_id");
    }

    public boolean canReadOrders(UUID restaurantId) {
        return hasPermission(restaurantId, RestaurantPermission.ORDER_READ);
    }

    public boolean canCreateOrders(UUID restaurantId) {
        return hasPermission(restaurantId, RestaurantPermission.ORDER_CREATE);
    }

    public boolean canUpdateOrderStatus(UUID restaurantId) {
        return hasPermission(restaurantId, RestaurantPermission.ORDER_STATUS_UPDATE);
    }

    public boolean canManageMenu(UUID restaurantId) {
        return hasPermission(restaurantId, RestaurantPermission.MENU_MANAGE);
    }
}
