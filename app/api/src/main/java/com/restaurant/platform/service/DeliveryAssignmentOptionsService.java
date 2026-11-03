package com.restaurant.platform.service;

import com.restaurant.platform.dto.delivery.DeliveryAssignmentOption;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeliveryAssignmentOptionsService {
    private final RestaurantMemberRepository members;
    private final ProfileRepository profiles;
    private final RestaurantAuthorization authorization;

    @Transactional(readOnly = true)
    public List<DeliveryAssignmentOption> list(UUID restaurantId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.DELIVERY_ASSIGN);
        List<RestaurantMember> eligible = members.findEligibleDeliveryMembers(restaurantId);
        var byId = profiles.findAllById(eligible.stream().map(RestaurantMember::getUserId).toList()).stream()
                .collect(Collectors.toMap(Profile::getId, Function.identity()));
        return eligible.stream().map(member -> {
            Profile profile = byId.get(member.getUserId());
            return new DeliveryAssignmentOption(member.getUserId(), profile == null ? null : profile.getFullName(),
                    profile == null ? null : profile.getEmail(), member.getRole());
        }).toList();
    }
}
