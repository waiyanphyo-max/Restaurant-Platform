package com.restaurant.platform.config;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.DeserializationFeature;

/** A fractional JSON amount must be rejected, never silently truncated to a long. */
@Configuration
public class ExactNumberConfiguration {
    @Bean
    JsonMapperBuilderCustomizer exactIntegerRequests() {
        return builder -> builder.disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT);
    }
}
