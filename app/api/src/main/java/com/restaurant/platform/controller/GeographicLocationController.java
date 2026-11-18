package com.restaurant.platform.controller;

import com.restaurant.platform.service.GeographicLocationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/locations")
@RequiredArgsConstructor
public class GeographicLocationController {
    private final GeographicLocationService locations;
    @GetMapping("/regions")
    public ResponseEntity<List<GeographicLocationService.Location>> regions() {return response(locations.regions());}
    @GetMapping("/regions/{regionId}/districts")
    public ResponseEntity<List<GeographicLocationService.Location>> districts(@PathVariable UUID regionId) {return response(locations.districts(regionId));}
    @GetMapping("/districts/{districtId}/townships")
    public ResponseEntity<List<GeographicLocationService.Location>> townships(@PathVariable UUID districtId) {return response(locations.townships(districtId));}
    private static ResponseEntity<List<GeographicLocationService.Location>> response(List<GeographicLocationService.Location> body) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate()).body(body);
    }
}
