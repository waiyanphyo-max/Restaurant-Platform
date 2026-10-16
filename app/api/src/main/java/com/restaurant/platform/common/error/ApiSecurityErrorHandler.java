package com.restaurant.platform.common.error;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.LocaleResolver;
import tools.jackson.databind.json.JsonMapper;

/** Localized JSON responses for authentication and authorization failures in the security filter chain. */
@Component
public class ApiSecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final MessageSource messages;
    private final LocaleResolver localeResolver;
    private final JsonMapper jsonMapper;

    public ApiSecurityErrorHandler(
            MessageSource messages,
            LocaleResolver localeResolver,
            JsonMapper jsonMapper) {
        this.messages = messages;
        this.localeResolver = localeResolver;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        writeError(request, response, HttpStatus.UNAUTHORIZED,
                "UNAUTHORIZED", "error.unauthorized");
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        writeError(request, response, HttpStatus.FORBIDDEN,
                "FORBIDDEN", "error.forbidden");
    }

    private void writeError(
            HttpServletRequest request,
            HttpServletResponse response,
            HttpStatus status,
            String code,
            String messageKey) throws IOException {
        Locale locale = localeResolver.resolveLocale(request);
        ApiErrorResponse body = ApiErrorResponse.of(
                status.value(),
                code,
                messages.getMessage(messageKey, null, locale),
                request.getRequestURI());

        response.setStatus(status.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        jsonMapper.writeValue(response.getOutputStream(), body);
    }
}
