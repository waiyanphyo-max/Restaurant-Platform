package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerProfileResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerAvatarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/customer/profile/avatar")
@RequiredArgsConstructor
public class CustomerAvatarController {
    private final CustomerAvatarService avatarService;
    private final RestaurantAuthorization authorization;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CustomerProfileResponse upload(@RequestPart("file") MultipartFile file) {
        return avatarService.upload(authorization.requireAuthenticatedUserId(), file);
    }
}
