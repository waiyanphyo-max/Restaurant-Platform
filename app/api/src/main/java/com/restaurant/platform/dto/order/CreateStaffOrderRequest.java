package com.restaurant.platform.dto.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateStaffOrderRequest(
        @NotNull @Pattern(regexp = "DINE_IN|TAKEAWAY") String orderType,
        UUID tableId,
        @NotEmpty @Size(max = 50) List<@Valid CreateOrderItemRequest> items,
        @Size(max = 500) String note
) {
}
