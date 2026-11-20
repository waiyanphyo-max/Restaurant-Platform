package com.restaurant.platform.dto.menu;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record UpdateFeaturedProductRequest(
        @JsonProperty(value = "productId", required = true) UUID productId,
        @NotNull @Min(0) @Max(9007199254740991L) Long expectedRevision) {
    @JsonAnySetter
    public void rejectUnsupportedField(String field, Object value) {
        throw new IllegalArgumentException("Featured accepts only productId and expectedRevision.");
    }
}
