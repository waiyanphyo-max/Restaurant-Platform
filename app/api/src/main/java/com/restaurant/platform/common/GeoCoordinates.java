package com.restaurant.platform.common;

import java.math.BigDecimal;

/** A complete, in-range point, or two nulls when navigation is unavailable. */
public record GeoCoordinates(BigDecimal latitude, BigDecimal longitude) {
    private static final BigDecimal MAX_LATITUDE = BigDecimal.valueOf(90);
    private static final BigDecimal MAX_LONGITUDE = BigDecimal.valueOf(180);

    public GeoCoordinates {
        if (latitude == null || longitude == null
                || latitude.abs().compareTo(MAX_LATITUDE) > 0
                || longitude.abs().compareTo(MAX_LONGITUDE) > 0) {
            latitude = null;
            longitude = null;
        }
    }
}
