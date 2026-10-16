package com.restaurant.platform.dto.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateQrOrderRequest(

        @NotBlank
        @Size(max = 64)
        String qrToken,

        @NotEmpty
        @Size(max = 50)
        List<@Valid CreateOrderItemRequest> items
) {
}