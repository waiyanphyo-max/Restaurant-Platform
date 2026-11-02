package com.restaurant.platform.accounting;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountingSupportTest {
    @Test void localCalendarBoundariesRespectDstAndLeapYears() {
        UUID restaurant = UUID.randomUUID();
        var settings = new RestaurantSettings(); settings.setTimezone("America/New_York");
        var repository = mock(RestaurantSettingsRepository.class); when(repository.findById(restaurant)).thenReturn(Optional.of(settings));
        var support = new AccountingSupport(mock(JdbcTemplate.class), mock(RestaurantAuthorization.class), repository);
        var spring = support.range(restaurant, LocalDate.of(2026,3,8), LocalDate.of(2026,3,8));
        assertEquals(23, Duration.between(spring.start(), spring.end()).toHours());
        var fall = support.range(restaurant, LocalDate.of(2026,11,1), LocalDate.of(2026,11,1));
        assertEquals(25, Duration.between(fall.start(), fall.end()).toHours());
        assertDoesNotThrow(() -> support.range(restaurant, LocalDate.of(2024,1,1), LocalDate.of(2024,12,31)));
        assertThrows(ApiException.class, () -> support.range(restaurant, LocalDate.of(2024,1,1), LocalDate.of(2025,1,1)));
    }
    @Test void exactValuesSurviveJsonAndRejectFractionalCurrency() {
        assertEquals(9007199254740993L, AccountingSupport.whole(new BigDecimal("9007199254740993")));
        assertThrows(ApiException.class, () -> AccountingSupport.whole(new BigDecimal("1.5")));
        assertThrows(ApiException.class, () -> AccountingSupport.whole(new BigDecimal("9223372036854775808")));
        var mapper = JsonMapper.builder().disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).findAndAddModules().build();
        var summary = new SalesDtos.Summary(LocalDate.of(2026,1,1), LocalDate.of(2026,1,1),9007199254740993L,0,9007199254740993L,0,0,0,1,0,1,0);
        assertTrue(mapper.writeValueAsString(summary).contains("\"grossSales\":\"9007199254740993\""));
        assertThrows(Exception.class, () -> mapper.readValue("{\"category\":\"RENT\",\"amount\":1.5,\"expenseDate\":\"2026-01-01\",\"description\":\"Rent\"}", ExpenseDtos.Create.class));
    }
    @Test void onlyOwnersAndManagersHaveFinancialPermissions() {
        for (var role : RestaurantRole.values()) {
            boolean financial = role == RestaurantRole.OWNER || role == RestaurantRole.MANAGER;
            assertEquals(financial, role.allows(RestaurantPermission.FINANCE_READ));
            assertEquals(financial, role.allows(RestaurantPermission.FINANCE_MANAGE));
        }
    }
    @Test void exportsEscapeSpreadsheetFormulasAndEmbeddedQuotes() {
        assertEquals("\"'=SUM(A1)\"", AccountingSupport.csv("=SUM(A1)"));
        assertEquals("\"'  @payload\"", AccountingSupport.csv("  @payload"));
        assertEquals("\"A,\"\"B\"\"\"", AccountingSupport.csv("A,\"B\""));
    }
}
