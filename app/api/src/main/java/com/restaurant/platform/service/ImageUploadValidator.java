package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Locale;
import java.util.Map;

/** Validates image media before a privileged server-side Storage upload. */
@Component
public class ImageUploadValidator {
    private static final Map<String, String> SUPPORTED_TYPES = Map.of(
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/webp", "webp");

    public ValidatedImage validate(MultipartFile file, long maxBytes) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_IMAGE_FILE", "error.media.invalid-file");
        }
        if (file.getSize() > maxBytes) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "IMAGE_FILE_TOO_LARGE", "error.media.file-too-large");
        }

        String contentType = file.getContentType() == null
                ? "" : file.getContentType().trim().toLowerCase(Locale.ROOT);
        String extension = SUPPORTED_TYPES.get(contentType);
        if (extension == null) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "UNSUPPORTED_IMAGE_TYPE", "error.media.invalid-file");
        }

        final byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "IMAGE_FILE_READ_FAILED", "error.media.invalid-file");
        }

        if (!matchesSignature(contentType, bytes)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "IMAGE_CONTENT_MISMATCH", "error.media.invalid-file");
        }
        return new ValidatedImage(contentType, extension, bytes);
    }

    private boolean matchesSignature(String contentType, byte[] bytes) {
        return switch (contentType) {
            case "image/png" -> bytes.length >= 8
                    && bytes[0] == (byte) 0x89
                    && bytes[1] == 0x50
                    && bytes[2] == 0x4E
                    && bytes[3] == 0x47
                    && bytes[4] == 0x0D
                    && bytes[5] == 0x0A
                    && bytes[6] == 0x1A
                    && bytes[7] == 0x0A;
            case "image/jpeg" -> bytes.length >= 3
                    && bytes[0] == (byte) 0xFF
                    && bytes[1] == (byte) 0xD8
                    && bytes[2] == (byte) 0xFF;
            case "image/webp" -> bytes.length >= 12
                    && bytes[0] == 'R'
                    && bytes[1] == 'I'
                    && bytes[2] == 'F'
                    && bytes[3] == 'F'
                    && bytes[8] == 'W'
                    && bytes[9] == 'E'
                    && bytes[10] == 'B'
                    && bytes[11] == 'P';
            default -> false;
        };
    }

    public record ValidatedImage(String contentType, String extension, byte[] bytes) {
    }
}
