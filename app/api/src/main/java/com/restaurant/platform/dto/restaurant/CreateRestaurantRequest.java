package com.restaurant.platform.dto.restaurant;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record CreateRestaurantRequest(
        @NotBlank @Size(max = 150) String name,
        @NotBlank @Size(max = 100) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @Size(max = 4000) String description,
        @Size(max = 30) String phone,
        @Size(max = 2000) String address,
        @Size(max = 50) String houseNo,
        @Size(max = 100) String street,
        @Size(max = 100) String ward,
        @NotBlank @Size(max = 100) String township,
        @NotBlank @Size(max = 100) String city,
        @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
        @Size(max = 2000) String logoUrl,
        @Pattern(regexp = "[A-Za-z]{3}") String currency,
        @Size(max = 60) String timezone
) {
}
