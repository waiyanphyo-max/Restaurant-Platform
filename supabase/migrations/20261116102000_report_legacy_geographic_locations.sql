-- Confident legacy zones acquire only identity columns; existing labels and fees are preserved.
WITH matches AS (
 SELECT z.id,r.id AS region_id,d.id AS district_id,t.id AS township_id,r.name_en AS region_name,d.name_en AS district_name,
  count(*) OVER(PARTITION BY z.id) AS candidate_count
 FROM public.delivery_zones z JOIN public.geo_regions r ON r.active AND
 regexp_replace(lower(btrim(r.name_en)),' (region|state|union territory)$','')=regexp_replace(lower(btrim(z.coverage_city)),' (region|state|union territory)$','')
 JOIN public.geo_districts d ON d.region_id=r.id AND d.active
 JOIN public.geo_townships t ON t.district_id=d.id AND t.active AND lower(t.name_en)=lower(btrim(z.coverage_township))
 WHERE z.township_id IS NULL AND (SELECT count(*) FROM public.geo_townships candidate JOIN public.geo_districts parent ON parent.id=candidate.district_id WHERE parent.region_id=r.id AND lower(candidate.name_en)=lower(t.name_en))=1
)
UPDATE public.delivery_zones z SET region_id=m.region_id,district_id=m.district_id,township_id=m.township_id,region_name=m.region_name,district_name=m.district_name
FROM matches m WHERE m.id=z.id AND m.candidate_count=1;
-- Review-only mapping candidates. Customer addresses and historical orders are never rewritten.
-- A platform operator can explicitly approve a unique candidate after the customer/owner reviews it.
CREATE OR REPLACE VIEW public.legacy_geographic_location_review WITH (security_invoker = true) AS
WITH legacy AS (
 SELECT 'customer_address'::text AS record_type,id,user_id AS owner_id,city AS region_text,township AS township_text,township_id FROM public.customer_addresses
 UNION ALL
 SELECT 'delivery_zone',id,restaurant_id,coverage_city,coverage_township,township_id FROM public.delivery_zones
), candidates AS (
 SELECT l.record_type,l.id,l.owner_id,l.region_text,l.township_text,count(t.id) AS candidate_count,
  count(t.id) FILTER(WHERE t.active AND d.active AND r.active) AS eligible_candidate_count,
  array_agg(t.id) FILTER(WHERE t.id IS NOT NULL) AS candidate_township_ids
 FROM legacy l
 LEFT JOIN public.geo_regions r ON
  regexp_replace(lower(btrim(r.name_en)),' (region|state|union territory)$','') = regexp_replace(lower(btrim(l.region_text)),' (region|state|union territory)$','')
 LEFT JOIN public.geo_districts d ON d.region_id=r.id
 LEFT JOIN public.geo_townships t ON t.district_id=d.id AND lower(t.name_en)=lower(btrim(l.township_text))
 WHERE l.township_id IS NULL
 GROUP BY l.record_type,l.id,l.owner_id,l.region_text,l.township_text
)
SELECT *,CASE WHEN candidate_count=1 AND eligible_candidate_count=1 THEN 'unique_candidate_requires_review' WHEN candidate_count=0 THEN 'unmatched' WHEN candidate_count=1 THEN 'inactive_requires_review' ELSE 'ambiguous' END AS review_status FROM candidates;
REVOKE ALL ON public.legacy_geographic_location_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.legacy_geographic_location_review TO service_role;
COMMENT ON VIEW public.legacy_geographic_location_review IS 'Platform-only review report; never automatic address or historical order rewriting. No live data is exported by this migration.';
