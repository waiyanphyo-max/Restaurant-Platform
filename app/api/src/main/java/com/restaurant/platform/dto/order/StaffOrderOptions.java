package com.restaurant.platform.dto.order;

import java.util.List;
import java.util.UUID;

public record StaffOrderOptions(boolean dineInEnabled, boolean takeawayEnabled, List<Table> tables) {

    public record Table(UUID id, String tableLabel) {}
}
