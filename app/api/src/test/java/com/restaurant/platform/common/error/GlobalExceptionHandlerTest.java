package com.restaurant.platform.common.error;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private GlobalExceptionHandler handler;

    @BeforeEach
    void setUp() {
        StaticMessageSource messages = new StaticMessageSource();
        messages.addMessage("error.bad-request", Locale.ENGLISH, "The request is invalid.");
        messages.addMessage("error.unauthorized", Locale.ENGLISH, "Please sign in.");
        messages.addMessage("error.forbidden", Locale.ENGLISH, "Access denied.");
        messages.addMessage("error.not-found", Locale.ENGLISH, "Resource not found.");
        messages.addMessage("error.conflict", Locale.ENGLISH, "A conflict occurred.");
        messages.addMessage("error.internal", Locale.ENGLISH, "An unexpected error occurred.");
        handler = new GlobalExceptionHandler(messages);
    }

    @Test
    void responseStatusNotFoundRetains404AndStableJsonShape() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/missing");
        ResponseEntity<ApiErrorResponse> response = handler.handleResponseStatusException(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "internal route detail"),
                request,
                Locale.ENGLISH);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(404, response.getBody().status());
        assertEquals("NOT_FOUND", response.getBody().code());
        assertEquals("Resource not found.", response.getBody().message());
        assertEquals("/api/v1/missing", response.getBody().path());
        assertFalse(response.getBody().message().contains("internal route detail"));
    }

    @Test
    void responseStatusConflictRetains409() {
        MockHttpServletRequest request = new MockHttpServletRequest("PATCH", "/api/v1/orders/1");
        ResponseEntity<ApiErrorResponse> response = handler.handleResponseStatusException(
                new ResponseStatusException(HttpStatus.CONFLICT, "database constraint name"),
                request,
                Locale.ENGLISH);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("CONFLICT", response.getBody().code());
        assertEquals("A conflict occurred.", response.getBody().message());
        assertFalse(response.getBody().message().contains("database constraint name"));
    }

    @Test
    void methodLevelAccessDeniedReturns403WithoutExposingExceptionDetails() {
        MockHttpServletRequest request = new MockHttpServletRequest(
                "GET", "/api/v1/manager-probe");

        ResponseEntity<ApiErrorResponse> response = handler.handleAccessDenied(
                new AccessDeniedException("internal permission expression"),
                request,
                Locale.ENGLISH);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("FORBIDDEN", response.getBody().code());
        assertEquals("Access denied.", response.getBody().message());
        assertFalse(response.getBody().message().contains("internal permission expression"));
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void unexpectedAccountingErrorOmitsFinancialPayloadFromLogs(CapturedOutput output) {
        var request = new MockHttpServletRequest("POST", "/api/v1/restaurants/restaurant/accounting/expenses");
        var response = handler.handleUnexpectedException(
                new IllegalStateException("private expense row amount 4378265", new RuntimeException("private invoice")),
                request, Locale.ENGLISH);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertTrue(output.getAll().contains("Unhandled accounting API error (IllegalStateException)"));
        assertFalse(output.getAll().contains("4378265"));
        assertFalse(output.getAll().contains("private invoice"));
    }

    @Test
    void responseStatusBadRequestRetains400() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/orders");
        ResponseEntity<ApiErrorResponse> response = handler.handleResponseStatusException(
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "raw exception reason"),
                request,
                Locale.ENGLISH);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("BAD_REQUEST", response.getBody().code());
        assertEquals("The request is invalid.", response.getBody().message());
    }
}
