package com.restaurant.platform.common.error;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Returns localized API error messages according to the request's Accept-Language.
 * Assumes ApiException exposes getStatus(), getCode(), and getMessageKey(),
 * and ApiErrorResponse has the constructor used below.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final MessageSource messages;

    public GlobalExceptionHandler(MessageSource messages) {
        this.messages = messages;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApiException(
            ApiException exception,
            HttpServletRequest request,
            Locale locale) {

        String message = message(exception.getMessageKey(), exception.getMessageArgs(), locale);
        return response(
                exception.getStatus(), exception.getCode(), message, request, List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleRequestValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request,
            Locale locale) {

        List<ApiErrorResponse.FieldViolation> errors = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> new ApiErrorResponse.FieldViolation(
                        error.getField(), validationMessage(error.getCode(), locale)))
                .distinct()
                .toList();

        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                message("error.validation", locale),
                request,
                errors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(
            ConstraintViolationException exception,
            HttpServletRequest request,
            Locale locale) {

        List<ApiErrorResponse.FieldViolation> errors = exception.getConstraintViolations()
                .stream()
                .map(this::toFieldViolation)
                .map(error -> new ApiErrorResponse.FieldViolation(
                        error.field(), validationMessage(error.constraintCode(), locale)))
                .toList();

        return response(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                message("error.validation", locale),
                request,
                errors);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadableBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request,
            Locale locale) {

        return response(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST_BODY",
                message("error.bad-request", locale),
                request,
                List.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleDataConflict(
            DataIntegrityViolationException exception,
            HttpServletRequest request,
            Locale locale) {

        // Log the database cause on the server only; do not expose it to API clients.
        log.warn("Database constraint conflict at {}", request.getRequestURI());
        return response(
                HttpStatus.CONFLICT,
                "DATA_CONFLICT",
                message("error.conflict", locale),
                request,
                List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpectedException(
            Exception exception,
            HttpServletRequest request,
            Locale locale) {

        log.error("Unhandled API error at {}", request.getRequestURI(), exception);
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                message("error.internal", locale),
                request,
                List.of());
    }

    private ResponseEntity<ApiErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request,
            List<ApiErrorResponse.FieldViolation> errors) {

        ApiErrorResponse body = new ApiErrorResponse(
                Instant.now(),
                status.value(),
                code,
                message,
                request.getRequestURI(),
                errors);
        return ResponseEntity.status(status).body(body);
    }

    /**
     * Resolve a message key using the selected locale. If a key is missing from
     * the bundles, return the key as a safe fallback instead of throwing another
     * NoSuchMessageException while handling the original exception.
     */
    private String message(String key, Locale locale) {
        return message(key, null, locale);
    }

    private String message(String key, Object[] args, Locale locale) {
        String safeKey = (key == null || key.isBlank()) ? "error.internal" : key;
        return messages.getMessage(safeKey, args, safeKey, locale);
    }

    private String validationMessage(String validationCode, Locale locale) {
        if (validationCode != null) {
            if (validationCode.startsWith("NotBlank")
                    || validationCode.startsWith("NotNull")
                    || validationCode.startsWith("NotEmpty")) {
                return message("validation.required", locale);
            }
            if (validationCode.startsWith("Email")) {
                return message("validation.email", locale);
            }
            if (validationCode.startsWith("Positive")
                    || validationCode.startsWith("Min")
                    || validationCode.startsWith("Max")
                    || validationCode.startsWith("DecimalMin")
                    || validationCode.startsWith("DecimalMax")) {
                return message("validation.range", locale);
            }
            if (validationCode.startsWith("Size")
                    || validationCode.startsWith("Length")) {
                return message("validation.size", locale);
            }
            if (validationCode.startsWith("Pattern")) {
                return message("validation.pattern", locale);
            }
        }
        return message("validation.invalid", locale);
    }

    private ConstraintViolationInfo toFieldViolation(ConstraintViolation<?> violation) {
        String annotationName = violation.getConstraintDescriptor()
                .getAnnotation()
                .annotationType()
                .getSimpleName();
        return new ConstraintViolationInfo(
                violation.getPropertyPath().toString(), annotationName);
    }

    private record ConstraintViolationInfo(String field, String constraintCode) {
    }
}
