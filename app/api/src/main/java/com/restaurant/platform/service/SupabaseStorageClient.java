package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.UUID;

/**
 * Server-only Supabase Storage client. The service-role credential must never
 * be exposed to browser/mobile code. Public bucket reads are used for logos;
 * uploads are made only after the application verifies restaurant ownership.
 */
@Component
public class SupabaseStorageClient {

    private final RestClient restClient = RestClient.create();
    private final String projectUrl;
    private final String serviceRoleKey;
    private final String bucket;

    public SupabaseStorageClient(
            @Value("${app.supabase-admin.project-url:}") String projectUrl,
            @Value("${app.supabase-admin.service-role-key:}") String serviceRoleKey,
            @Value("${app.supabase-admin.storage-bucket:restaurant-logos}") String bucket) {
        this.projectUrl = projectUrl == null ? "" : projectUrl.trim().replaceAll("/+$", "");
        this.serviceRoleKey = serviceRoleKey == null ? "" : serviceRoleKey.trim();
        this.bucket = bucket == null || bucket.isBlank() ? "restaurant-logos" : bucket.trim();
    }

    public String uploadRestaurantLogo(UUID restaurantId, String contentType, byte[] imageBytes) {
        requireConfigured();
        URI uploadUri = storageObjectUri(restaurantId);

        try {
            restClient.post()
                    .uri(uploadUri)
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .header("x-upsert", "true")
                    .header(HttpHeaders.CACHE_CONTROL, "max-age=0")
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(imageBytes)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw new ApiException(
                    HttpStatus.BAD_GATEWAY,
                    "RESTAURANT_LOGO_STORAGE_UPLOAD_FAILED",
                    "error.logo.storage-upload-failed");
        }

        // Stable object path, with a cache-busting query so clients refresh replaced logos.
        return UriComponentsBuilder.fromUriString(projectUrl)
                .path("/storage/v1/object/public/")
                .pathSegment(bucket, restaurantId.toString(), "logo")
                .queryParam("v", UUID.randomUUID().toString())
                .build()
                .encode()
                .toUriString();
    }

    private URI storageObjectUri(UUID restaurantId) {
        return UriComponentsBuilder.fromUriString(projectUrl)
                .path("/storage/v1/object/")
                .pathSegment(bucket, restaurantId.toString(), "logo")
                .build()
                .encode()
                .toUri();
    }

    private void requireConfigured() {
        if (projectUrl.isBlank() || serviceRoleKey.isBlank()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "RESTAURANT_LOGO_STORAGE_NOT_CONFIGURED",
                    "error.logo.storage-not-configured");
        }
        if (bucket.contains("/") || bucket.contains("..")) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "RESTAURANT_LOGO_STORAGE_NOT_CONFIGURED",
                    "error.logo.storage-not-configured");
        }
    }
}
