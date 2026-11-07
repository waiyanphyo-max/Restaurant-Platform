package com.restaurant.platform.service;

import java.util.regex.Pattern;

/** Structural validation of a dialable checkout contact. Keep in sync with Customer Android. */
final class DeliveryRecipientPhone {
    private static final Pattern FORMATTED = Pattern.compile("\\+?(?:[0-9. \\u00a0\\u202f-]|\\([0-9]+\\))+");
    private static final Pattern MYANMAR = Pattern.compile("\\+95(?:9[0-9]{6,9}|[1-8][0-9]{5,8})");
    private static final Pattern INTERNATIONAL = Pattern.compile("\\+[1-9][0-9]{6,14}");

    private DeliveryRecipientPhone() { }

    static String normalize(String input) {
        if (input == null || input.length() > 30) return null;

        StringBuilder ascii = new StringBuilder(input.length());
        for (char digit : input.trim().toCharArray()) {
            ascii.append(digit >= '\u1040' && digit <= '\u1049' ? (char) ('0' + digit - '\u1040') : digit);
        }
        if (!FORMATTED.matcher(ascii).matches()) return null;

        String number = ascii.toString().replaceAll("[. ()\\u00a0\\u202f-]", "");
        if (number.startsWith("00")) {
            number = "+" + number.substring(2);
        } else if (number.startsWith("0")) {
            number = "+95" + number.substring(1);
        }
        Pattern format = number.startsWith("+95") ? MYANMAR : INTERNATIONAL;
        return format.matcher(number).matches() ? number : null;
    }
}
