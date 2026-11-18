package com.restaurant.platform.dto.customer;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

public record CustomerAddressRequest(
        @NotBlank @Size(max = 50) String label,
        @Size(max = 150) String recipientName,
        @Size(max = 50) String houseNo,
        @Size(max = 100) String street,
        @Size(max = 100) String ward,
        @Size(max = 100) String township,
        @Size(max = 100) String city,
        @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
        @Size(max = 2000) String deliveryNote,
        boolean makeDefault,
        UUID regionId, UUID districtId, UUID townshipId,
        @Size(max = 30) String recipientPhone
) {
    public CustomerAddressRequest(String label,String recipientName,String houseNo,String street,String ward,String township,String city,BigDecimal latitude,BigDecimal longitude,String deliveryNote,boolean makeDefault) {
        this(label,recipientName,houseNo,street,ward,township,city,latitude,longitude,deliveryNote,makeDefault,null,null,null,null);
    }
    /** Legacy manual addresses may omit a point; a saved point must contain both axes. */
    @AssertTrue(message = "Latitude and longitude must be supplied together")
    public boolean isCoordinatePairComplete() {
        return (latitude == null) == (longitude == null);
    }
}
