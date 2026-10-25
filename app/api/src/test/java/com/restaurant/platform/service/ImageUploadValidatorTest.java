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
}
