package com.restaurant.platform.controller;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.common.error.ApiSecurityErrorHandler;
import com.restaurant.platform.config.LocaleConfig;
import com.restaurant.platform.config.SecurityConfig;
import com.restaurant.platform.service.GeographicLocationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers=GeographicLocationController.class,properties={
 "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://auth.example.test/auth/v1",
 "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://auth.example.test/auth/v1/.well-known/jwks.json"})
@Import({SecurityConfig.class,ApiSecurityErrorHandler.class,LocaleConfig.class})
class GeographicLocationControllerHttpTest {
 @Autowired MockMvc mvc;
 @MockitoBean GeographicLocationService locations;
 @MockitoBean JwtDecoder decoder;
 @Test void publicReferenceReadsAreCachedAndHaveStableDtos() throws Exception {
  var id=UUID.randomUUID();
  when(locations.regions()).thenReturn(List.of(new GeographicLocationService.Location(id,"source-region-1","Yangon Region",null,null,null)));
  mvc.perform(get("/api/v1/locations/regions")).andExpect(status().isOk())
   .andExpect(header().string("Cache-Control","max-age=3600, private"))
   .andExpect(jsonPath("$[0].id").value(id.toString())).andExpect(jsonPath("$[0].nameEn").value("Yangon Region"));
 }
 @Test void mutationMethodsAndUnknownPublicRoutesAreDenied() throws Exception {
  mvc.perform(post("/api/v1/locations/regions")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/locations/private")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/v1/locations/regions").with(jwt())).andExpect(status().isMethodNotAllowed());
  mvc.perform(delete("/api/v1/locations/regions").with(jwt())).andExpect(status().isMethodNotAllowed());
  verifyNoInteractions(locations);
 }
 @Test void invalidAndInactiveParentsHaveUsefulResponses() throws Exception {
  var id=UUID.randomUUID();
  when(locations.districts(id)).thenThrow(new ApiException(HttpStatus.NOT_FOUND,"LOCATION_PARENT_NOT_FOUND","error.location.parent-not-found"));
  mvc.perform(get("/api/v1/locations/regions/invalid/districts").with(jwt())).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/locations/regions/"+id+"/districts").with(jwt())).andExpect(status().isNotFound())
    .andExpect(jsonPath("$.code").value("LOCATION_PARENT_NOT_FOUND"));
 }
}
