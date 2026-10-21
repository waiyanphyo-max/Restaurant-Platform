package com.restaurant.platform.controller;

import com.restaurant.platform.dto.member.RestaurantMemberRequest;
import com.restaurant.platform.dto.member.RestaurantMemberResponse;
import com.restaurant.platform.dto.member.TransferRestaurantOwnershipRequest;
import com.restaurant.platform.dto.member.TransferRestaurantOwnershipResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.RestaurantMemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/members")
@RequiredArgsConstructor
public class RestaurantMemberController {

    private final RestaurantMemberService memberService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public List<RestaurantMemberResponse> list(@PathVariable UUID restaurantId) {
        return memberService.list(restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RestaurantMemberResponse add(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody RestaurantMemberRequest request) {
        return memberService.add(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PostMapping("/transfer-ownership")
    public TransferRestaurantOwnershipResponse transferOwnership(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody TransferRestaurantOwnershipRequest request) {
        return memberService.transferOwnership(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/{memberId}")
    public RestaurantMemberResponse update(
            @PathVariable UUID restaurantId,
            @PathVariable UUID memberId,
            @Valid @RequestBody RestaurantMemberRequest request) {
        return memberService.update(
                restaurantId, authorization.requireAuthenticatedUserId(), memberId, request);
    }

    @DeleteMapping("/{memberId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(
            @PathVariable UUID restaurantId,
            @PathVariable UUID memberId) {
        memberService.remove(
                restaurantId, authorization.requireAuthenticatedUserId(), memberId);
    }
}
