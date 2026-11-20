package com.restaurant.platform.service;

import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.entity.RestaurantFeaturedProduct;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeaturedProductServiceTest {
    @Test void absentSnapshotCannotPairOldNoneWithConcurrentNewRevision() {
        UUID tenant = UUID.randomUUID(), selected = UUID.randomUUID();
        var repository = mock(RestaurantFeaturedProductRepository.class);
        var menu = mock(PublicMenuService.class);
        var newer = new RestaurantFeaturedProduct(); newer.setRestaurantId(tenant);
        newer.setProductId(selected); newer.setRevision(1L);
        when(repository.findById(tenant)).thenReturn(Optional.empty(), Optional.of(newer));
        when(menu.getMenu(tenant)).thenReturn(new PublicMenuResponse(tenant, "Tenant", "tenant", null,
                null, null, null, "MMK", List.of(),
                new FeaturedProductDto(selected, FeaturedProductDto.Status.UNAVAILABLE)));
        var service = new FeaturedProductService(mock(RestaurantAuthorization.class), mock(RestaurantRepository.class),
                mock(ProductRepository.class), repository, menu);
        var snapshot = service.get(tenant);
        assertNull(snapshot.productId()); assertEquals(0L, snapshot.revision());
        assertEquals(FeaturedProductDto.Status.NONE, snapshot.status());
        verify(repository, times(1)).findById(tenant);
    }

    @Test void availableVariantRequiresAnActualPriceEvenInOldMalformedFixture() {
        UUID id = UUID.randomUUID();
        var unavailablePrice = new MenuProductDto(id, "Synthetic", null, 100L, null, true, false, null,
                List.of(new MenuVariantDto(UUID.randomUUID(), "Legacy", null, true)), List.of());
        assertFalse(FeaturedProductDto.isEligible(unavailablePrice));
        var priced = new MenuProductDto(id, "Synthetic", null, 100L, null, true, false, null,
                List.of(new MenuVariantDto(UUID.randomUUID(), "Priced", 500L, true)), List.of());
        assertTrue(FeaturedProductDto.isEligible(priced));
    }
}
