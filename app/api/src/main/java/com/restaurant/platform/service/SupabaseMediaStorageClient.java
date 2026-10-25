package com.restaurant.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
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
import java.util.Map;

/**
 * Server-only media client for public menu assets and private customer avatars.
 * The service-role key must never be sent to a browser or mobile app.
 */
@Component
public class SupabaseMediaStorageClient {
    private static final int AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

    private final RestClient restClient = RestClient.create();
    private final String projectUrl;
    private final String serviceRoleKey;
    private final String menuImagesBucket;
    private final String customerAvatarsBucket;

    public SupabaseMediaStorageClient(
            @Value("${app.supabase-admin.project-url:}") String projectUrl,
            @Value("${app.supabase-admin.service-role-key:}") String serviceRoleKey,
            @Value("${app.supabase-admin.menu-images-bucket:menu-images}") String menuImagesBucket,
            @Value("${app.supabase-admin.customer-avatars-bucket:customer-avatars}") String customerAvatarsBucket) {
        this.projectUrl = projectUrl == null ? "" : projectUrl.trim().replaceAll("/+$", "");
        this.serviceRoleKey = serviceRoleKey == null ? "" : serviceRoleKey.trim();
        this.menuImagesBucket = normalizeBucket(menuImagesBucket, "menu-images");
        this.customerAvatarsBucket = normalizeBucket(customerAvatarsBucket, "customer-avatars");
    }

    public String uploadMenuImage(String objectPath, String contentType, byte[] imageBytes) {
        uploadObject(menuImagesBucket, objectPath, contentType, imageBytes);
        return publicUrl(menuImagesBucket, objectPath);
    }

    public String uploadPrivateAvatar(String objectPath, String contentType, byte[] imageBytes) {
        uploadObject(customerAvatarsBucket, objectPath, contentType, imageBytes);
        return objectPath;
    }

    public String createSignedAvatarUrl(String objectPath) {
        requireConfigured();
        if (objectPath == null || objectPath.isBlank()
                || objectPath.startsWith("/") || objectPath.contains("..")) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "MEDIA_STORAGE_NOT_CONFIGURED", "error.media.storage-not-configured");
        }

        try {
            JsonNode body = restClient.post()
                    .uri(objectUri("sign", customerAvatarsBucket, objectPath))
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("expiresIn", AVATAR_SIGNED_URL_TTL_SECONDS))
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null || !body.hasNonNull("signedURL")) {
                throw storageFailure();
            }
            String signedUrl = body.get("signedURL").asText();
            if (signedUrl.startsWith("https://") || signedUrl.startsWith("http://")) {
                return signedUrl;
            }
            if (signedUrl.startsWith("/storage/v1/")) {
                return projectUrl + signedUrl;
            }
            if (signedUrl.startsWith("/")) {
                return projectUrl + "/storage/v1" + signedUrl;
            }
            return projectUrl + "/storage/v1/" + signedUrl;
        } catch (RestClientException exception) {
            throw storageFailure();
        }
    }

    private void uploadObject(String bucket, String objectPath, String contentType, byte[] imageBytes) {
        requireConfigured();
        validateBucketAndPath(bucket, objectPath);
        try {
            restClient.post()
                    .uri(objectUri(null, bucket, objectPath))
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(imageBytes)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw storageFailure();
        }
    }

    private String publicUrl(String bucket, String objectPath) {
        String[] segments = pathSegments(bucket, objectPath);
        return UriComponentsBuilder.fromUriString(projectUrl)
                .path("/storage/v1/object/public/")
                .pathSegment(segments)
                .build()
                .encode()
                .toUriString();
    }

    private URI objectUri(String operation, String bucket, String objectPath) {
        String[] segments = pathSegments(bucket, objectPath);
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(projectUrl);
        if ("sign".equals(operation)) {
            builder.path("/storage/v1/object/sign/");
        } else {
            builder.path("/storage/v1/object/");
        }
        return builder.pathSegment(segments).build().encode().toUri();
    }

    private String[] pathSegments(String bucket, String objectPath) {
        String[] path = objectPath.split("/");
        String[] segments = new String[path.length + 1];
        segments[0] = bucket;
        System.arraycopy(path, 0, segments, 1, path.length);
        return segments;
    }

    private void validateBucketAndPath(String bucket, String objectPath) {
        if (bucket.contains("/") || bucket.contains("..") || objectPath == null
                || objectPath.isBlank() || objectPath.startsWith("/")
                || objectPath.contains("..") || objectPath.contains("\\")) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "MEDIA_STORAGE_NOT_CONFIGURED", "error.media.storage-not-configured");
        }
    }

    private String normalizeBucket(String bucket, String fallback) {
        String normalized = bucket == null || bucket.isBlank() ? fallback : bucket.trim();
        if (normalized.contains("/") || normalized.contains("..")) {
            throw new IllegalArgumentException("Supabase Storage bucket names must be a single bucket name.");
        }
        return normalized;
    }

    private void requireConfigured() {
        if (projectUrl.isBlank() || serviceRoleKey.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "MEDIA_STORAGE_NOT_CONFIGURED", "error.media.storage-not-configured");
        }
    }

    private ApiException storageFailure() {
        return new ApiException(HttpStatus.BAD_GATEWAY,
                "MEDIA_STORAGE_OPERATION_FAILED", "error.media.storage-operation-failed");
    }
}
