package com.restaurant.platform.accounting;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

class ShoppingPlanContractTest {
    private final JsonMapper mapper = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private final String fields = "\"itemId\":\"" + UUID.randomUUID() + "\",\"quantity\":\"1.5\",\"unit\":\"kg\"";

    @Test void quantityOnlyRowsRoundTripWithoutFinancialFields() {
        var line = mapper.readValue("{" + fields + "}", ProcurementDtos.PlanLineInput.class);
        assertEquals("1.5", line.quantity().toPlainString());
        assertEquals("kg", line.unit());
        var json = mapper.readTree(mapper.writeValueAsString(line));
        assertEquals(3, json.size());
        assertFalse(json.has("unitCost"));
    }

    @Test void outdatedFinancialPlanningPayloadsAreRejectedRatherThanDiscarded() {
        for (String extra : new String[]{"\"unitCost\":\"100\"", "\"lineTotal\":\"150\"", "\"supplierId\":null"}) {
            assertThrows(Exception.class, () -> mapper.readValue("{" + fields + "," + extra + "}", ProcurementDtos.PlanLineInput.class));
        }
    }
}
