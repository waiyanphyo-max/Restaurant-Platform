package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

/** Read-only reference queries. SQL joins enforce active ancestors and deterministic ordering. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeographicLocationService {
    private final JdbcTemplate jdbc;
    public record Location(UUID id,String code,String nameEn,String nameMy,UUID regionId,UUID districtId) {}
    public record Hierarchy(UUID regionId,UUID districtId,UUID townshipId,String regionName,String districtName,String townshipName) {}
    public List<Location> regions() {
        return jdbc.query("SELECT id,code,name_en,name_my FROM public.geo_regions WHERE active ORDER BY lower(name_en),id",
                (r,i)->new Location(r.getObject("id",UUID.class),r.getString("code"),r.getString("name_en"),r.getString("name_my"),null,null));
    }
    public List<Location> districts(UUID regionId) {
        requireParent("SELECT count(*) FROM public.geo_regions WHERE id=? AND active",regionId);
        return jdbc.query("SELECT d.id,d.code,d.name_en,d.name_my FROM public.geo_districts d JOIN public.geo_regions r ON r.id=d.region_id WHERE d.region_id=? AND d.active AND r.active ORDER BY lower(d.name_en),d.id",
                (r,i)->new Location(r.getObject("id",UUID.class),r.getString("code"),r.getString("name_en"),r.getString("name_my"),regionId,null),regionId);
    }
    public List<Location> townships(UUID districtId) {
        requireParent("SELECT count(*) FROM public.geo_districts d JOIN public.geo_regions r ON r.id=d.region_id WHERE d.id=? AND d.active AND r.active",districtId);
        return jdbc.query("SELECT t.id,t.code,t.name_en,t.name_my,d.region_id FROM public.geo_townships t JOIN public.geo_districts d ON d.id=t.district_id JOIN public.geo_regions r ON r.id=d.region_id WHERE t.district_id=? AND t.active AND d.active AND r.active ORDER BY lower(t.name_en),t.id",
                (r,i)->new Location(r.getObject("id",UUID.class),r.getString("code"),r.getString("name_en"),r.getString("name_my"),r.getObject("region_id",UUID.class),districtId),districtId);
    }
    private void requireParent(String sql,UUID id) {
        if (id==null || !Long.valueOf(1).equals(jdbc.queryForObject(sql,Long.class,id)))
            throw new ApiException(HttpStatus.NOT_FOUND,"LOCATION_PARENT_NOT_FOUND","error.location.parent-not-found");
    }
    private static final String HIERARCHY = """
        SELECT r.id AS region_id,d.id AS district_id,t.id AS township_id,
               r.name_en AS region_name,d.name_en AS district_name,t.name_en AS township_name
        FROM public.geo_townships t JOIN public.geo_districts d ON d.id=t.district_id
        JOIN public.geo_regions r ON r.id=d.region_id WHERE t.active AND d.active AND r.active
        """;
    public Hierarchy resolve(UUID regionId,UUID districtId,UUID townshipId,String legacyRegion,String legacyTownship) {
        List<Hierarchy> matches;
        if (regionId!=null || districtId!=null || townshipId!=null) {
            if (regionId==null || districtId==null || townshipId==null) throw invalid();
            matches=jdbc.query(HIERARCHY+" AND r.id=? AND d.id=? AND t.id=?",GeographicLocationService::hierarchy,regionId,districtId,townshipId);
        } else {
            // Older installed clients may only supply labels: resolve only an exact, unique source name
            // within an exact region (allow its administrative suffix). Never create or fuzzy-match.
            if (legacyRegion==null || legacyTownship==null || legacyRegion.isBlank() || legacyTownship.isBlank()) throw invalid();
            matches=jdbc.query(HIERARCHY+"""
                 AND regexp_replace(lower(r.name_en),' (region|state|union territory)$','')=regexp_replace(lower(btrim(?)),' (region|state|union territory)$','')
                 AND lower(t.name_en)=lower(btrim(?))
                 AND (SELECT count(*) FROM public.geo_townships candidate
                      JOIN public.geo_districts parent ON parent.id=candidate.district_id
                      WHERE parent.region_id=r.id AND lower(candidate.name_en)=lower(t.name_en))=1
                """,GeographicLocationService::hierarchy,legacyRegion,legacyTownship);
        }
        if(matches.size()!=1) throw invalid();
        return matches.getFirst();
    }
    private static Hierarchy hierarchy(java.sql.ResultSet r,int index) throws java.sql.SQLException {
        return new Hierarchy(r.getObject("region_id",UUID.class),r.getObject("district_id",UUID.class),r.getObject("township_id",UUID.class),r.getString("region_name"),r.getString("district_name"),r.getString("township_name"));
    }
    private static ApiException invalid() {return new ApiException(HttpStatus.BAD_REQUEST,"CANONICAL_LOCATION_REQUIRED","error.location.canonical-required");}
}
