package com.restaurant.platform.dto.customer;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record CustomerAddressRequest(
        @NotBlank @Size(max = 50) String label,
        @Size(max = 150) String recipientName,
        @Size(max = 50) String houseNo,
        @Size(max = 100) String street,
        @Size(max = 100) String ward,
        @NotBlank @Size(max = 100) String township,
        @NotBlank @Size(max = 100) String city,
        @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
        @Size(max = 2000) String deliveryNote,
        boolean makeDefault
) {
    /** Legacy manual addresses may omit a point; a saved point must contain both axes. */
    @AssertTrue(message = "Latitude and longitude must be supplied together")
    public boolean isCoordinatePairComplete() {
        return (latitude == null) == (longitude == null);
    }
}
