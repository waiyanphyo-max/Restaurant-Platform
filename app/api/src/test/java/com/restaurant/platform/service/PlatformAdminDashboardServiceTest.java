package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.PlatformRestaurantSummaryResponse;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PlatformAdminDashboardServiceTest {
    private PlatformAdminAuthorization authorization;
    private RestaurantRepository restaurantRepository;
    private RestaurantMemberRepository memberRepository;
    private OrderRepository orderRepository;
    private PlatformAdminDashboardService service;

    @BeforeEach
    void setUp() {
        authorization = mock(PlatformAdminAuthorization.class);
        restaurantRepository = mock(RestaurantRepository.class);
        memberRepository = mock(RestaurantMemberRepository.class);
        orderRepository = mock(OrderRepository.class);
        service = new PlatformAdminDashboardService(
                authorization, restaurantRepository, memberRepository, orderRepository);
    }

    @Test
    void overviewReturnsRealAggregateCountsAfterAuthorization() {
        when(restaurantRepository.countByIsActiveTrue()).thenReturn(4L);
        when(restaurantRepository.countByIsActiveFalse()).thenReturn(2L);
        when(orderRepository.count()).thenReturn(51L);
        when(memberRepository.count()).thenReturn(13L);

        var response = service.getOverview();

        assertEquals(6, response.totalRestaurants());
        assertEquals(4, response.activeRestaurants());
        assertEquals(2, response.inactiveRestaurants());
        assertEquals(51, response.totalOrders());
        assertEquals(13, response.totalRestaurantMembers());
        verify(authorization).requirePlatformAdmin();
        verify(restaurantRepository).countByIsActiveTrue();
    }

    @Test
    void listingNormalizesSearchAndBoundsPageSize() {
        var row = new PlatformRestaurantSummaryResponse(
                UUID.randomUUID(), "Garden", "garden", "Yangon", "Bahan", true,
                OffsetDateTime.now(), "Owner", "owner@example.com", 2, 8);
        var expected = new PageImpl<>(List.of(row), PageRequest.of(3, 100), 101);
        when(restaurantRepository.searchForPlatformAdmin(
                "%garden city%", RestaurantRole.OWNER, PageRequest.of(3, 100)))
                .thenReturn(expected);

        var actual = service.listRestaurants("  Garden City  ", 3, 500);

        assertSame(expected, actual);
        verify(authorization).requirePlatformAdmin();
        verify(restaurantRepository).searchForPlatformAdmin(
                "%garden city%", RestaurantRole.OWNER, PageRequest.of(3, 100));
    }

    @Test
    void rejectedOverviewDoesNotReadAnyPlatformData() {
        when(authorization.requirePlatformAdmin()).thenThrow(new ApiException(
                HttpStatus.FORBIDDEN, "PLATFORM_ADMIN_REQUIRED", "error.platform-admin.required"));

        var error = assertThrows(ApiException.class, service::getOverview);

        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verifyNoInteractions(restaurantRepository, memberRepository, orderRepository);
    }

    @Test
    void rejectedRegistryDoesNotQueryRestaurants() {
        when(authorization.requirePlatformAdmin()).thenThrow(new ApiException(
                HttpStatus.FORBIDDEN, "PLATFORM_ADMIN_REQUIRED", "error.platform-admin.required"));

        var error = assertThrows(ApiException.class, () -> service.listRestaurants("", 0, 20));

        assertEquals("PLATFORM_ADMIN_REQUIRED", error.getCode());
        verifyNoInteractions(restaurantRepository);
    }
}
