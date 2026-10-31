package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration.Android;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration.AndroidApplication;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfiguration.GuestDomains;
import com.restaurant.platform.dto.platform.PlatformRestaurantConfigurationRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantDetailResponse;
import com.restaurant.platform.dto.platform.PlatformRestaurantStatusRequest;
import com.restaurant.platform.dto.restaurant.RestaurantResponse;
import com.restaurant.platform.entity.Restaurant;
import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.entity.RestaurantPlatformConfiguration;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.ProfileRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantPlatformConfigurationRepository;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.IDN;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class PlatformRestaurantLifecycleService {
    private final PlatformAdminAuthorization authorization;
    private final RestaurantRepository restaurants;
    private final RestaurantSettingsRepository settings;
    private final RestaurantMemberRepository members;
    private final OrderRepository orders;
    private final ProfileRepository profiles;
    private final RestaurantPlatformConfigurationRepository configurations;
    private final SupabaseAuthAdminClient authAdmin;
    private final String publicWebBaseUrl;

    public PlatformRestaurantLifecycleService(
            PlatformAdminAuthorization authorization,
            RestaurantRepository restaurants,
            RestaurantSettingsRepository settings,
            RestaurantMemberRepository members,
            OrderRepository orders,
            ProfileRepository profiles,
            RestaurantPlatformConfigurationRepository configurations,
            SupabaseAuthAdminClient authAdmin,
            @Value("${app.public-web-base-url:http://localhost:3000}") String publicWebBaseUrl) {
        this.authorization = authorization;
        this.restaurants = restaurants;
        this.settings = settings;
        this.members = members;
        this.orders = orders;
        this.profiles = profiles;
        this.configurations = configurations;
        this.authAdmin = authAdmin;
        this.publicWebBaseUrl = publicWebBaseUrl == null ? ""
                : publicWebBaseUrl.trim().replaceAll("/+$", "");
    }

    @Transactional(readOnly = true)
    public PlatformRestaurantDetailResponse getDetail(UUID restaurantId) {
        authorization.requirePlatformAdmin();
        return detail(requireRestaurant(restaurantId));
    }

    @Transactional
    public PlatformRestaurantDetailResponse updateStatus(
            UUID restaurantId, PlatformRestaurantStatusRequest request) {
        authorization.requirePlatformAdmin();
        if (request == null || request.active() == null) {
            throw invalidConfiguration();
        }
        Restaurant restaurant = requireRestaurant(restaurantId);
        restaurant.setIsActive(request.active());
        return detail(restaurants.saveAndFlush(restaurant));
    }

    @Transactional
    public PlatformRestaurantDetailResponse updateConfiguration(
            UUID restaurantId, PlatformRestaurantConfigurationRequest request) {
        authorization.requirePlatformAdmin();
        if (request == null || clean(request.name()) == null || request.name().trim().length() > 150
                || request.slug() == null || request.slug().length() > 100
                || !request.slug().matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
            throw invalidConfiguration();
        }
        String logoUrl = validateLogoUrl(request.logoUrl());
        PlatformRestaurantConfiguration configuration = validateConfiguration(request.configuration());
        Restaurant restaurant = requireRestaurant(restaurantId);
        if (restaurants.existsBySlugAndIdNot(request.slug(), restaurantId)) {
            throw slugConflict();
        }
        restaurant.setName(request.name().trim());
        restaurant.setSlug(request.slug());
        restaurant.setLogoUrl(logoUrl);
        try {
            restaurant = restaurants.saveAndFlush(restaurant);
        } catch (DataIntegrityViolationException exception) {
            throw slugConflict();
        }
        saveConfiguration(restaurantId, configuration);
        return detail(restaurant);
    }

    /** Validate before creating any external Auth invitation. Null means unconfigured metadata. */
    public PlatformRestaurantConfiguration validateConfiguration(PlatformRestaurantConfiguration input) {
        if (input == null) {
            return PlatformRestaurantConfiguration.empty();
        }
        String primary = validateColor(input.primaryColor());
        String secondary = validateColor(input.secondaryColor());
        GuestDomains domains = input.guestDomains() == null
                ? new GuestDomains(List.of(), List.of())
                : new GuestDomains(normalizeDomains(input.guestDomains().staging()),
                        normalizeDomains(input.guestDomains().production()));
        var allDomains = new ArrayList<>(domains.staging());
        allDomains.addAll(domains.production());
        if (new HashSet<>(allDomains).size() != allDomains.size()) {
            throw invalidConfiguration();
        }
        Android android = input.android() == null
                ? PlatformRestaurantConfiguration.empty().android()
                : new Android(normalizeAndroid(input.android().operations()),
                        normalizeAndroid(input.android().customer()));
        var ids = new ArrayList<String>();
        for (AndroidApplication app : List.of(android.operations(), android.customer())) {
            if (app.stagingApplicationId() != null) ids.add(app.stagingApplicationId());
            if (app.productionApplicationId() != null) ids.add(app.productionApplicationId());
        }
        if (new HashSet<>(ids).size() != ids.size()) {
            throw invalidConfiguration();
        }
        return new PlatformRestaurantConfiguration(primary, secondary, domains, android);
    }

    /** Joins the provisioning transaction; raw QR credentials never enter this table. */
    @Transactional
    public void initializeConfiguration(UUID restaurantId, PlatformRestaurantConfiguration configuration) {
        authorization.requirePlatformAdmin();
        if (configuration != null) {
            saveConfiguration(restaurantId, validateConfiguration(configuration));
        }
    }

    public String validateLogoUrl(String value) {
        String logoUrl = clean(value);
        if (logoUrl == null) return null;
        try {
            URI uri = URI.create(logoUrl);
            if (logoUrl.length() > 2000 || !"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null) {
                throw invalidConfiguration();
            }
            return uri.toASCIIString();
        } catch (IllegalArgumentException exception) {
            throw invalidConfiguration();
        }
    }

    private PlatformRestaurantDetailResponse detail(Restaurant restaurant) {
        UUID id = restaurant.getId();
        var restaurantSettings = settings.findById(id).orElse(null);
        var metadata = configurations.findById(id)
                .map(RestaurantPlatformConfiguration::getConfiguration)
                .map(this::validateConfiguration)
                .orElseGet(PlatformRestaurantConfiguration::empty);
        var owners = members.findByRestaurantIdAndRoleOrderByCreatedAtAsc(id, RestaurantRole.OWNER)
                .stream().map(this::owner).toList();
        return new PlatformRestaurantDetailResponse(
                toResponse(restaurant),
                restaurantSettings == null ? null : restaurantSettings.getCurrency(),
                restaurantSettings == null ? null : restaurantSettings.getTimezone(),
                members.countByRestaurantId(id), orders.countByRestaurantId(id), owners, metadata,
                workspaceUrl(id, false), workspaceUrl(id, true),
                List.of(
                        "Ask the Owner to accept the Supabase email invitation and finish account setup.",
                        "The Owner signs in to the workspace to review restaurant details, menu, staff, and order settings.",
                        "Generate or rotate restaurant QR credentials in the authorized Owner workspace. Share only the final customer QR through an approved channel.",
                        "Saving domains and Android configuration records metadata only. DNS, guest website host mapping, branding assets, and Android builds require deployment review."));
    }

    private PlatformRestaurantDetailResponse.Owner owner(RestaurantMember member) {
        var profile = profiles.findById(member.getUserId()).orElse(null);
        String email = null;
        String fullName = profile == null ? null : profile.getFullName();
        String status = "PROVIDER_UNAVAILABLE";
        try {
            var authUser = authAdmin.getUserById(member.getUserId());
            if (authUser != null && member.getUserId().equals(authUser.id())) {
                email = authUser.email();
                status = authUser.emailConfirmedAt() != null || authUser.phoneConfirmedAt() != null
                        ? "ACCEPTED" : authUser.invitedAt() != null ? "INVITED" : "NOT_INVITED";
            }
        } catch (SupabaseAuthAdminException exception) {
            // Show incomplete provider status without inventing acceptance or hiding restaurant data.
        }
        return new PlatformRestaurantDetailResponse.Owner(member.getUserId(), email, fullName, status);
    }

    private String workspaceUrl(UUID id, boolean qrSetup) {
        try {
            URI base = URI.create(publicWebBaseUrl == null ? "" : publicWebBaseUrl.trim());
            boolean localHttp = "http".equalsIgnoreCase(base.getScheme())
                    && base.getHost() != null
                    && List.of("localhost", "127.0.0.1", "[::1]", "::1").contains(base.getHost());
            if ((!"https".equalsIgnoreCase(base.getScheme()) && !localHttp)
                    || base.getHost() == null || base.getUserInfo() != null
                    || base.getQuery() != null || base.getFragment() != null) {
                throw new IllegalArgumentException("Invalid public workspace origin");
            }
            var builder = UriComponentsBuilder.fromUri(base).path("/workspace")
                    .queryParam("restaurantId", id);
            if (qrSetup) builder.queryParam("setup", "qr");
            return builder.build().encode().toUriString();
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PLATFORM_WORKSPACE_URL_NOT_CONFIGURED", "error.platform-admin.workspace-url");
        }
    }

    private void saveConfiguration(UUID id, PlatformRestaurantConfiguration configuration) {
        RestaurantPlatformConfiguration row = configurations.findById(id)
                .orElseGet(RestaurantPlatformConfiguration::new);
        row.setRestaurantId(id);
        row.setConfiguration(configuration);
        configurations.save(row);
    }

    private Restaurant requireRestaurant(UUID id) {
        return restaurants.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                "RESTAURANT_NOT_FOUND", "error.restaurant.not-found"));
    }

    private String validateColor(String color) {
        String value = clean(color);
        if (value != null && !value.matches("#[0-9a-fA-F]{6}")) throw invalidConfiguration();
        return value == null ? null : value.toUpperCase(Locale.ROOT);
    }

    private List<String> normalizeDomains(List<String> domains) {
        if (domains == null) return List.of();
        if (domains.size() > 20) throw invalidConfiguration();
        return domains.stream().map(domain -> {
            try {
                if (domain == null || domain.isBlank()) throw invalidConfiguration();
                String normalized = IDN.toASCII(domain.trim(), IDN.USE_STD3_ASCII_RULES)
                        .toLowerCase(Locale.ROOT);
                if (normalized.length() > 253
                        || !normalized.matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+")
                        || normalized.matches("[0-9.]+")) throw invalidConfiguration();
                return normalized;
            } catch (IllegalArgumentException exception) {
                throw invalidConfiguration();
            }
        }).toList();
    }

    private AndroidApplication normalizeAndroid(AndroidApplication app) {
        if (app == null) return new AndroidApplication(null, null, null, null);
        String displayName = clean(app.displayName());
        String iconPath = clean(app.iconPath());
        if (displayName != null && displayName.length() > 100) throw invalidConfiguration();
        if (iconPath != null && (iconPath.length() > 500
                || !iconPath.matches("assets/[A-Za-z0-9_/-]+\\.png") || iconPath.contains(".."))) {
            throw invalidConfiguration();
        }
        return new AndroidApplication(displayName, validateApplicationId(app.stagingApplicationId()),
                validateApplicationId(app.productionApplicationId()), iconPath);
    }

    private String validateApplicationId(String input) {
        String value = clean(input);
        if (value != null && (value.length() > 200
                || !value.matches("[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+"))) {
            throw invalidConfiguration();
        }
        return value;
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private ApiException invalidConfiguration() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PLATFORM_CONFIGURATION",
                "error.platform-admin.invalid-configuration");
    }

    private ApiException slugConflict() {
        return new ApiException(HttpStatus.CONFLICT, "RESTAURANT_SLUG_EXISTS", "error.restaurant.slug-exists");
    }

    private RestaurantResponse toResponse(Restaurant restaurant) {
        return new RestaurantResponse(restaurant.getId(), restaurant.getName(), restaurant.getSlug(),
                restaurant.getDescription(), restaurant.getPhone(), restaurant.getAddress(),
                restaurant.getHouseNo(), restaurant.getStreet(), restaurant.getWard(),
                restaurant.getTownship(), restaurant.getCity(), restaurant.getLatitude(), restaurant.getLongitude(),
                restaurant.getLogoUrl(), Boolean.TRUE.equals(restaurant.getIsActive()),
                restaurant.getCreatedAt(), restaurant.getUpdatedAt());
    }
}
