package com.restaurant.platform.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class DeliveryRecipientPhoneTest {
    @ParameterizedTest
    @CsvSource({
            "09123456, +959123456",
            "09 942-123-456, +959942123456",
            "၀၉ ၉၄၂-၁၂၃-၄၅၆, +959942123456",
            "0095 9 942 123 456, +959942123456",
            "(01) 234567, +951234567",
            "+1 (415) 555-0132, +14155550132",
            "+39 02 1234 5678, +390212345678",
            "+123456789012345, +123456789012345"
    })
    void normalizesMyanmarAndInternationalNumbersWithoutChangingSignificantDigits(String input, String expected) {
        assertEquals(expected, DeliveryRecipientPhone.normalize(input));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"abc", "123456789", "09 12345", "091234567890", "+950942123456", "+1 (415 555-0132",
            "+1 415 555 0132 x2", "+1234567890123456", "00 0000000"})
    void rejectsClearlyInvalidNumbers(String input) {
        assertNull(DeliveryRecipientPhone.normalize(input));
    }
}
