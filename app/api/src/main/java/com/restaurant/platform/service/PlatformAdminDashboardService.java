package com.restaurant.platform.service;

import com.restaurant.platform.dto.platform.PlatformOverviewResponse;
import com.restaurant.platform.dto.platform.PlatformRestaurantSummaryResponse;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlatformAdminDashboardService {
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final PlatformAdminAuthorization platformAdminAuthorization;
    private final RestaurantRepository restaurantRepository;
    private final RestaurantMemberRepository restaurantMemberRepository;
    private final OrderRepository orderRepository;

    public PlatformOverviewResponse getOverview() {
        platformAdminAuthorization.requirePlatformAdmin();
        long activeRestaurants = restaurantRepository.countByIsActiveTrue();
        long inactiveRestaurants = restaurantRepository.countByIsActiveFalse();
        return new PlatformOverviewResponse(
                activeRestaurants + inactiveRestaurants,
                activeRestaurants,
                inactiveRestaurants,
                orderRepository.count(),
                restaurantMemberRepository.count());
    }

    public Page<PlatformRestaurantSummaryResponse> listRestaurants(
            String search, int page, int size) {
        platformAdminAuthorization.requirePlatformAdmin();
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        String pattern = normalizedSearch.isEmpty() ? "%%" : "%" + normalizedSearch + "%";
        int safePage = Math.max(0, page);
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        return restaurantRepository.searchForPlatformAdmin(
                pattern, RestaurantRole.OWNER, PageRequest.of(safePage, safeSize));
    }
}
