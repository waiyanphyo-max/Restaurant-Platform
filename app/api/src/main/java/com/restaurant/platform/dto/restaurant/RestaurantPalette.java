package com.restaurant.platform.dto.restaurant;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Inputs only: accessible semantic colors are derived by the shared UI resolver. */
public record RestaurantPalette(
        @NotNull @Size(min = 7, max = 7) @Pattern(regexp = "#[0-9a-fA-F]{6}") String primaryColor,
        @NotNull @Size(min = 7, max = 7) @Pattern(regexp = "#[0-9a-fA-F]{6}") String secondaryColor,
        @NotNull @Size(min = 7, max = 7) @Pattern(regexp = "#[0-9a-fA-F]{6}") String backgroundColor) {
    @JsonAnySetter
    public void rejectUnsupportedField(String field, Object value) {
        throw new IllegalArgumentException("Palette accepts only primaryColor, secondaryColor and backgroundColor.");
    }
}
