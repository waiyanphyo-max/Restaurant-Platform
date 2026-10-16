package com.restaurant.platform.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;

public final class TokenUtils {

    private static final SecureRandom RANDOM = new SecureRandom();

    private TokenUtils() {
    }

    public static String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    public static String sha256(String token) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));

            return HexFormat.of().formatHex(hash);

        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(
                    "SHA-256 is unavailable",
                    ex
            );
        }
    }

    public static boolean matches(
            String rawToken,
            String storedHash
    ) {
        if (rawToken == null || storedHash == null) {
            return false;
        }

        byte[] actualHash = sha256(rawToken)
                .getBytes(StandardCharsets.UTF_8);

        byte[] expectedHash = storedHash
                .getBytes(StandardCharsets.UTF_8);

        return MessageDigest.isEqual(actualHash, expectedHash);
    }
}