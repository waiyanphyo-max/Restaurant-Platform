package com.restaurant.platform.config;

import java.util.Enumeration;
import java.util.Locale;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

/**
 * API localization policy:
 * - Burmese (my-MM) is the default and fallback language.
 * - Any English Accept-Language variant (en, en-US, en-GB, etc.) resolves to English.
 * - Any Burmese variant resolves to my-MM.
 * - Unsupported languages fall back to Burmese.
 *
 * Clients can send either `Accept-Language: my-MM` or `Accept-Language: en`.
 */
@Configuration
public class LocaleConfig {

    private static final Locale BURMESE = Locale.forLanguageTag("my-MM");
    private static final Locale ENGLISH = Locale.ENGLISH;

    @Bean
    public LocaleResolver localeResolver() {
        return new AcceptHeaderLocaleResolver() {
            @Override
            public Locale resolveLocale(HttpServletRequest request) {
                Enumeration<Locale> requestedLocales = request.getLocales();

                while (requestedLocales.hasMoreElements()) {
                    String language = requestedLocales.nextElement()
                            .getLanguage()
                            .toLowerCase(Locale.ROOT);

                    if ("my".equals(language)) {
                        return BURMESE;
                    }
                    if ("en".equals(language)) {
                        return ENGLISH;
                    }
                }

                return BURMESE;
            }

            // Locale is selected by the Accept-Language header for each API request.
            // Clients should change this header when users select a different language.
            @Override
            public void setLocale(
                    HttpServletRequest request,
                    HttpServletResponse response,
                    Locale locale) {
                throw new UnsupportedOperationException(
                        "Change the language by sending the Accept-Language header.");
            }
        };
    }
}
