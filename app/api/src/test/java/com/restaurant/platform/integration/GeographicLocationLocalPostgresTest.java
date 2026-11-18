package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.service.GeographicLocationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

/** Explicitly restricted to the disposable loopback QA database; never hosted Supabase. */
@EnabledIfEnvironmentVariable(named="ACCOUNTING_TEST_DATABASE_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
class GeographicLocationLocalPostgresTest {
 private JdbcTemplate jdbc;
 private GeographicLocationService locations;
 @BeforeEach void setup() {
  jdbc=new JdbcTemplate(new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DATABASE_URL"),"postgres",""));
  locations=new GeographicLocationService(jdbc);
 }
 @Test void auditedSeedRetainsEverySourceIdentityAndRepeatsWithoutDuplicates() throws Exception {
  assertEquals(15,locations.regions().size());
  assertEquals(85L,jdbc.queryForObject("SELECT count(*) FROM public.geo_districts",Long.class));
  assertEquals(323L,jdbc.queryForObject("SELECT count(*) FROM public.geo_townships",Long.class));
  assertEquals(313L,jdbc.queryForObject("SELECT count(*) FROM public.geo_townships WHERE active",Long.class));
  var seed=Path.of("../../supabase/migrations/20261116101000_seed_myanmar_geography_v1.sql");
  jdbc.execute(Files.readString(seed));
  assertEquals(323L,jdbc.queryForObject("SELECT count(*) FROM public.geo_townships",Long.class));
 }
 @Test void exactLegacyResolutionValidatesAllParentsAndRejectsAmbiguousAndUnknownNames() {
  var tamwe=locations.resolve(null,null,null," Yangon "," Tamwe ");
  assertEquals("Yangon Region",tamwe.regionName()); assertEquals("East Yangon",tamwe.districtName());
  assertEquals(tamwe,locations.resolve(tamwe.regionId(),tamwe.districtId(),tamwe.townshipId(),"spoofed","spoofed"));
  assertThrows(ApiException.class,()->locations.resolve(UUID.randomUUID(),tamwe.districtId(),tamwe.townshipId(),null,null));
  assertThrows(ApiException.class,()->locations.resolve(null,null,tamwe.townshipId(),null,null));
  var magwayMinhla=locations.resolve(null,null,null,"Magway","Minhla");
  var bagoMinhla=locations.resolve(null,null,null,"Bago","Minhla");
  assertEquals("Thayet",magwayMinhla.districtName());
  assertEquals("Tharrawaddy",bagoMinhla.districtName());
  assertNotEquals(magwayMinhla.regionId(),bagoMinhla.regionId());
  assertNotEquals(magwayMinhla.districtId(),bagoMinhla.districtId());
  assertNotEquals(magwayMinhla.townshipId(),bagoMinhla.townshipId());
  assertThrows(ApiException.class,()->locations.resolve(null,null,null,"Magway","Thayet"));
  assertThrows(ApiException.class,()->locations.resolve(null,null,null,"Unknown","Tamwe"));
 }
 @Test void sameRegionHomonymsRequireExplicitIdentityEvenWhenOneRecordIsInactive() {
  var tamwe=locations.resolve(null,null,null,"Yangon","Tamwe");
  var otherDistrict=jdbc.queryForObject("SELECT id FROM public.geo_districts WHERE region_id=? AND id<>? AND active ORDER BY id LIMIT 1",UUID.class,tamwe.regionId(),tamwe.districtId());
  var fixtureId=UUID.randomUUID();
  jdbc.update("INSERT INTO public.geo_townships(id,district_id,code,name_en) VALUES (?,?,?,'Tamwe')",fixtureId,otherDistrict,"qa-homonym-"+fixtureId);
  try {
   assertThrows(ApiException.class,()->locations.resolve(null,null,null,"Yangon","Tamwe"));
   assertEquals(tamwe,locations.resolve(tamwe.regionId(),tamwe.districtId(),tamwe.townshipId(),null,null));
   jdbc.update("UPDATE public.geo_townships SET active=false WHERE id=?",fixtureId);
   assertThrows(ApiException.class,()->locations.resolve(null,null,null,"Yangon","Tamwe"));
   assertEquals(tamwe,locations.resolve(tamwe.regionId(),tamwe.districtId(),tamwe.townshipId(),null,null));
  } finally {jdbc.update("DELETE FROM public.geo_townships WHERE id=?",fixtureId);}
 }
 @Test void inactiveAncestorsAndInvalidParentIdsAreExcluded() {
  var tamwe=locations.resolve(null,null,null,"Yangon","Tamwe");
  assertThrows(ApiException.class,()->locations.districts(UUID.randomUUID()));
  assertThrows(ApiException.class,()->locations.townships(UUID.randomUUID()));
  jdbc.update("UPDATE public.geo_regions SET active=false WHERE id=?",tamwe.regionId());
  try {
   assertFalse(locations.regions().stream().anyMatch(r->r.id().equals(tamwe.regionId())));
   assertThrows(ApiException.class,()->locations.districts(tamwe.regionId()));
   assertThrows(ApiException.class,()->locations.townships(tamwe.districtId()));
   assertThrows(ApiException.class,()->locations.resolve(tamwe.regionId(),tamwe.districtId(),tamwe.townshipId(),null,null));
  } finally {jdbc.update("UPDATE public.geo_regions SET active=true WHERE id=?",tamwe.regionId());}
  jdbc.update("UPDATE public.geo_districts SET active=false WHERE id=?",tamwe.districtId());
  try {assertThrows(ApiException.class,()->locations.townships(tamwe.districtId()));}
  finally {jdbc.update("UPDATE public.geo_districts SET active=true WHERE id=?",tamwe.districtId());}
 }
 @Test void foreignKeysUniquenessAndReadOnlyDatabasePrivilegesHold() {
  assertThrows(DataAccessException.class,()->jdbc.update("INSERT INTO public.geo_townships(id,district_id,code,name_en) VALUES (?,?,'invalid-parent','Invalid')",UUID.randomUUID(),UUID.randomUUID()));
  var tamwe=locations.resolve(null,null,null,"Yangon","Tamwe");
  assertThrows(DataAccessException.class,()->jdbc.update("INSERT INTO public.geo_townships(id,district_id,code,name_en) VALUES (?,?,'duplicate-tamwe','tamwe')",UUID.randomUUID(),tamwe.districtId()));
  for(var role:new String[]{"anon","authenticated","service_role"}) for(var table:new String[]{"geo_regions","geo_districts","geo_townships"}) {
   assertFalse(jdbc.queryForObject("SELECT has_table_privilege(?, ?, 'INSERT,UPDATE,DELETE,TRUNCATE')",Boolean.class,role,"public."+table));
  }
  assertTrue(jdbc.queryForObject("SELECT relrowsecurity FROM pg_class WHERE oid='public.geo_townships'::regclass",Boolean.class));
  assertFalse(jdbc.queryForObject("SELECT has_table_privilege('authenticated','public.legacy_geographic_location_review','SELECT')",Boolean.class));
 }
}
