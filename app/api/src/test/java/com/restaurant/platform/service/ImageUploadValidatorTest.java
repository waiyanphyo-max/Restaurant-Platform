package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.*;

class ImageUploadValidatorTest {
    private final ImageUploadValidator validator = new ImageUploadValidator();

    @Test
    void acceptsPngWithMatchingSignature() {
        byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        var result = validator.validate(
                new MockMultipartFile("file", "menu.png", "image/png", png), 1024);

        assertEquals("image/png", result.contentType());
        assertEquals("png", result.extension());
        assertArrayEquals(png, result.bytes());
    }

    @Test
    void rejectsMimeTypeWithWrongSignature() {
        var file = new MockMultipartFile("file", "fake.png", "image/png", "not an image".getBytes());

        ApiException error = assertThrows(ApiException.class,
                () -> validator.validate(file, 1024));

        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, error.getStatus());
        assertEquals("IMAGE_CONTENT_MISMATCH", error.getCode());
    }

    @Test
    void rejectsImagesAboveTheConfiguredLimit() {
        var file = new MockMultipartFile("file", "large.png", "image/png",
                new byte[1025]);

        ApiException error = assertThrows(ApiException.class,
                () -> validator.validate(file, 1024));

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, error.getStatus());
        assertEquals("IMAGE_FILE_TOO_LARGE", error.getCode());
    }

    @Test
    void acceptsJpegAndWebpOnlyWithTheirMatchingDeclaredType() {
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
        byte[] webp = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};
        assertEquals("jpg", validator.validate(new MockMultipartFile("file", "source.jpg", "image/jpeg", jpeg), 1024).extension());
        assertEquals("webp", validator.validate(new MockMultipartFile("file", "source.webp", "image/webp", webp), 1024).extension());
        assertEquals("IMAGE_CONTENT_MISMATCH", assertThrows(ApiException.class,
                () -> validator.validate(new MockMultipartFile("file", "source.webp", "image/webp", jpeg), 1024)).getCode());
    }

    @Test
    void rejectsMissingEmptyAndUnsupportedFiles() {
        assertEquals("INVALID_IMAGE_FILE", assertThrows(ApiException.class, () -> validator.validate(null, 1024)).getCode());
        assertEquals("INVALID_IMAGE_FILE", assertThrows(ApiException.class,
                () -> validator.validate(new MockMultipartFile("file", new byte[0]), 1024)).getCode());
        assertEquals("UNSUPPORTED_IMAGE_TYPE", assertThrows(ApiException.class,
                () -> validator.validate(new MockMultipartFile("file", "image.svg", "image/svg+xml", new byte[] {1}), 1024)).getCode());
    }
}
