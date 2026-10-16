package com.restaurant.platform.common.error;

import org.springframework.http.HttpStatus;

/**
 * Expected business exception. The message is resolved from messages*.properties
 * using the request locale; message arguments support placeholders such as {0}.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final String messageKey;
    private final Object[] messageArgs;

    public ApiException(HttpStatus status, String code, String messageKey, Object... messageArgs) {
        super(messageKey);
        this.status = status;
        this.code = code;
        this.messageKey = messageKey;
        this.messageArgs = messageArgs == null ? new Object[0] : messageArgs.clone();
    }

    public HttpStatus getStatus() {
        return status;
    }

    /** Stable language-independent error code for clients. */
    public String getCode() {
        return code;
    }

    /** Key found in messages.properties / messages_en.properties. */
    public String getMessageKey() {
        return messageKey;
    }

    /** Arguments substituted into the localized message, e.g. product or group name. */
    public Object[] getMessageArgs() {
        return messageArgs.clone();
    }
}
