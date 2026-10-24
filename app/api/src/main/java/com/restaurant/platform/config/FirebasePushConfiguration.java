package com.restaurant.platform.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

/**
 * Firebase Cloud Messaging is strictly opt-in. When enabled, provide a server-side
 * service-account JSON secret or application-default credentials from the hosting
 * environment. This class never reads Firebase secrets from frontend configuration.
 */
@Configuration
@ConditionalOnProperty(prefix = "app.push.firebase", name = "enabled", havingValue = "true")
@EnableScheduling
public class FirebasePushConfiguration {

    private static final String APP_NAME = "restaurant-platform-push";

    @Bean(name = "restaurantFirebaseApp", destroyMethod = "delete")
    public FirebaseApp restaurantFirebaseApp(
            @Value("${app.push.firebase.service-account-json:}") String serviceAccountJson)
            throws Exception {
        GoogleCredentials credentials;
        if (serviceAccountJson != null && !serviceAccountJson.isBlank()) {
            credentials = GoogleCredentials.fromStream(new ByteArrayInputStream(
                    serviceAccountJson.getBytes(StandardCharsets.UTF_8)));
        } else {
            credentials = GoogleCredentials.getApplicationDefault();
        }

        FirebaseOptions options = FirebaseOptions.builder()
                .setCredentials(credentials)
                .build();

        return FirebaseApp.initializeApp(options, APP_NAME);
    }

    @Bean
    public FirebaseMessaging restaurantFirebaseMessaging(
            FirebaseApp restaurantFirebaseApp) {
        return FirebaseMessaging.getInstance(restaurantFirebaseApp);
    }
}
