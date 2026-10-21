package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.restaurant.CreateRestaurantRequest;
import com.restaurant.platform.dto.restaurant.MyRestaurantResponse;
import com.restaurant.platform.dto.restaurant.RestaurantOnboardingResponse;
import com.restaurant.platform.dto.restaurant.RestaurantResponse;
import com.restaurant.platform.dto.restaurant.UpdateRestaurantRequest;
import com.restaurant.platform.entity.Profile;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantSettings;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import com.restaurant.platform.security.RestaurantRole;
import com.restaurant.platform.security.TokenUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class RestaurantManagementService {

    private final RestaurantRepository restaurantRepository;
    private final RestaurantSettingsRepository settingsRepository;
    private final RestaurantMemberRepository memberRepository;
    private final ProfileRepository profileRepository;
    private final RestaurantAuthorization authorization;

    public RestaurantManagementService(
            RestaurantRepository restaurantRepository,
            RestaurantSettingsRepository settingsRepository,
            RestaurantMemberRepository memberRepository,
            ProfileRepository profileRepository,
            RestaurantAuthorization authorization) {
        this.restaurantRepository = restaurantRepository;
        this.settingsRepository = settingsRepository;
        this.memberRepository = memberRepository;
        this.profileRepository = profileRepository;
        this.authorization = authorization;
    }

    @Transactional
    public RestaurantOnboardingResponse createRestaurant(
            UUID ownerUserId, CreateRestaurantRequest request) {
        authorization.requireAuthenticatedUserMatches(ownerUserId);
        validateCreateRequest(request);
        String slug = request.slug().trim().toLowerCase(Locale.ROOT);
        if (restaurantRepository.existsBySlug(slug)) {
            throw slugConflict();
        }

        String currency = request.currency() == null || request.currency().isBlank()
                ? "MMK" : request.currency().trim().toUpperCase(Locale.ROOT);
        String timezone = request.timezone() == null || request.timezone().isBlank()
                ? "Asia/Yangon" : request.timezone().trim();
        validateTimezone(timezone);

        // Make onboarding resilient even if the Auth-profile backfill migration
        // has not yet run for this user; the FK still ensures this is an Auth user.
        Profile profile = profileRepository.findById(ownerUserId).orElseGet(() -> {
            Profile created = new Profile();
            created.setId(ownerUserId);
            created.setPreferredLanguage("my-MM");
            return profileRepository.save(created);
        });

        Restaurant restaurant = new Restaurant();
        restaurant.setName(request.name().trim());
        restaurant.setSlug(slug);
        restaurant.setDescription(clean(request.description()));
        restaurant.setPhone(clean(request.phone()));
        restaurant.setAddress(clean(request.address()));
        restaurant.setHouseNo(clean(request.houseNo()));
        restaurant.setStreet(clean(request.street()));
        restaurant.setWard(clean(request.ward()));
        restaurant.setTownship(request.township().trim());
        restaurant.setCity(request.city().trim());
        restaurant.setLatitude(request.latitude());
        restaurant.setLongitude(request.longitude());
        restaurant.setLogoUrl(clean(request.logoUrl()));
        restaurant.setIsActive(true);
        try {
            restaurant = restaurantRepository.saveAndFlush(restaurant);
        } catch (DataIntegrityViolationException exception) {
            throw slugConflict();
        }

        String commonQrToken = TokenUtils.generateToken();
        RestaurantSettings settings = new RestaurantSettings();
        settings.setRestaurantId(restaurant.getId());
        settings.setCurrency(currency);
        settings.setTimezone(timezone);
        settings.setCommonQrToken(commonQrToken);
        settings.setMinimumOrder(0L);
        settings.setDefaultDeliveryFee(0L);
        settings.setAcceptsOrders(true);
        settings.setAllowQrOrder(true);
        settings.setAllowDelivery(true);
        settings.setAllowTakeaway(true);
        settingsRepository.save(settings);

        RestaurantMember owner = new RestaurantMember();
        owner.setRestaurantId(restaurant.getId());
        owner.setUserId(profile.getId());
        owner.setRole(RestaurantRole.OWNER);
        memberRepository.save(owner);

        return new RestaurantOnboardingResponse(
                toResponse(restaurant), RestaurantRole.OWNER.name(),
                currency, timezone, commonQrToken);
    }

    @Transactional(readOnly = true)
    public List<MyRestaurantResponse> listMyRestaurants(UUID userId) {
        authorization.requireAuthenticatedUserMatches(userId);
        return memberRepository.findByUserId(userId).stream()
                .map(member -> restaurantRepository.findById(member.getRestaurantId())
                        .map(restaurant -> new MyRestaurantResponse(
                                restaurant.getId(), restaurant.getName(), restaurant.getSlug(),
                                member.getRole().name(), Boolean.TRUE.equals(restaurant.getIsActive())))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    public RestaurantResponse getRestaurant(UUID restaurantId) {
        authorization.requirePermission(restaurantId, RestaurantPermission.RESTAURANT_READ);
        return toResponse(restaurantRepository.findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(this::restaurantNotFound));
    }

    @Transactional
    public RestaurantResponse updateRestaurant(
            UUID restaurantId, UUID actorUserId, UpdateRestaurantRequest request) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.SETTINGS_MANAGE);
        if (request == null || request.name() == null || request.name().isBlank()
                || request.township() == null || request.township().isBlank()
                || request.city() == null || request.city().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_RESTAURANT_PROFILE", "error.restaurant.invalid-profile");
        }
        Restaurant restaurant = restaurantRepository.findByIdAndIsActiveTrue(restaurantId)
                .orElseThrow(this::restaurantNotFound);
        restaurant.setName(request.name().trim());
        restaurant.setDescription(clean(request.description()));
        restaurant.setPhone(clean(request.phone()));
        restaurant.setAddress(clean(request.address()));
        restaurant.setHouseNo(clean(request.houseNo()));
        restaurant.setStreet(clean(request.street()));
        restaurant.setWard(clean(request.ward()));
        restaurant.setTownship(request.township().trim());
        restaurant.setCity(request.city().trim());
        restaurant.setLatitude(request.latitude());
        restaurant.setLongitude(request.longitude());
        restaurant.setLogoUrl(clean(request.logoUrl()));
        return toResponse(restaurantRepository.save(restaurant));
    }

    private void validateCreateRequest(CreateRestaurantRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()
                || request.slug() == null || request.slug().isBlank()
                || request.township() == null || request.township().isBlank()
                || request.city() == null || request.city().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_RESTAURANT_PROFILE", "error.restaurant.invalid-profile");
        }
    }

    private void validateTimezone(String timezone) {
        try {
            ZoneId.of(timezone);
        } catch (DateTimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_RESTAURANT_TIMEZONE", "error.settings.invalid-timezone", timezone);
        }
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private RestaurantResponse toResponse(Restaurant restaurant) {
        return new RestaurantResponse(
                restaurant.getId(), restaurant.getName(), restaurant.getSlug(),
                restaurant.getDescription(), restaurant.getPhone(), restaurant.getAddress(),
                restaurant.getHouseNo(), restaurant.getStreet(), restaurant.getWard(),
                restaurant.getTownship(), restaurant.getCity(), restaurant.getLogoUrl(),
                Boolean.TRUE.equals(restaurant.getIsActive()),
                restaurant.getCreatedAt(), restaurant.getUpdatedAt());
    }

    private ApiException slugConflict() {
        return new ApiException(HttpStatus.CONFLICT,
                "RESTAURANT_SLUG_EXISTS", "error.restaurant.slug-exists");
    }

    private ApiException restaurantNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "RESTAURANT_NOT_FOUND", "error.restaurant.not-found");
    }
}
