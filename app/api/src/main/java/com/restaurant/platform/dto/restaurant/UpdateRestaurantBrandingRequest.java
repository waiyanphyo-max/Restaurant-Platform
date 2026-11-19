package com.restaurant.platform.dto.restaurant;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateRestaurantBrandingRequest(
        @NotNull @Min(0) @Max(9007199254740991L) Long expectedRevision,
        @NotNull @Valid RestaurantPalette palette) {
    @JsonAnySetter
    public void rejectUnsupportedField(String field, Object value) {
        throw new IllegalArgumentException("Branding accepts only expectedRevision and palette.");
    }
}
