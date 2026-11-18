-- Global reference data. Only migration/platform maintenance credentials may write.
CREATE TABLE public.geo_regions (
 id uuid PRIMARY KEY, code varchar(80) NOT NULL UNIQUE,
 name_en varchar(150) NOT NULL CHECK (name_en = btrim(name_en) AND name_en <> ''),
 name_my varchar(150), active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX geo_regions_active_name_idx ON public.geo_regions(lower(name_en)) WHERE active;
CREATE TABLE public.geo_districts (
 id uuid PRIMARY KEY, region_id uuid NOT NULL REFERENCES public.geo_regions(id) ON DELETE RESTRICT,
 code varchar(80) NOT NULL UNIQUE,
 name_en varchar(150) NOT NULL CHECK (name_en = btrim(name_en) AND name_en <> ''),
 name_my varchar(150), active boolean NOT NULL DEFAULT true,
 UNIQUE(id,region_id)
);
CREATE INDEX geo_districts_region_idx ON public.geo_districts(region_id,active,name_en,id);
CREATE UNIQUE INDEX geo_districts_active_name_idx ON public.geo_districts(region_id,lower(name_en)) WHERE active;
CREATE TABLE public.geo_townships (
 id uuid PRIMARY KEY, district_id uuid NOT NULL REFERENCES public.geo_districts(id) ON DELETE RESTRICT,
 code varchar(80) NOT NULL UNIQUE,
 name_en varchar(150) NOT NULL CHECK (name_en = btrim(name_en) AND name_en <> ''),
 name_my varchar(150), active boolean NOT NULL DEFAULT true,
 UNIQUE(id,district_id)
);
CREATE INDEX geo_townships_district_idx ON public.geo_townships(district_id,active,name_en,id);
CREATE UNIQUE INDEX geo_townships_active_name_idx ON public.geo_townships(district_id,lower(name_en)) WHERE active;
ALTER TABLE public.geo_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_townships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geo_regions,public.geo_districts,public.geo_townships FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.geo_regions,public.geo_districts,public.geo_townships TO authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.geo_regions,public.geo_districts,public.geo_townships FROM service_role;
CREATE POLICY geo_regions_read ON public.geo_regions FOR SELECT TO authenticated USING(active);
CREATE POLICY geo_districts_read ON public.geo_districts FOR SELECT TO authenticated USING(active AND EXISTS(SELECT 1 FROM public.geo_regions r WHERE r.id=region_id AND r.active));
CREATE POLICY geo_townships_read ON public.geo_townships FOR SELECT TO authenticated USING(active AND EXISTS(SELECT 1 FROM public.geo_districts d WHERE d.id=district_id AND d.active));

-- Nullable additions preserve legacy records. Composite foreign keys validate the complete chain.
ALTER TABLE public.customer_addresses
 ADD COLUMN region_id uuid REFERENCES public.geo_regions(id),
 ADD COLUMN district_id uuid,
 ADD COLUMN township_id uuid,
 ADD COLUMN region_name varchar(150),
 ADD COLUMN district_name varchar(150),
 ADD COLUMN recipient_phone varchar(30),
 ADD CONSTRAINT customer_address_geo_district_fk FOREIGN KEY(district_id,region_id) REFERENCES public.geo_districts(id,region_id),
 ADD CONSTRAINT customer_address_geo_township_fk FOREIGN KEY(township_id,district_id) REFERENCES public.geo_townships(id,district_id),
 ADD CONSTRAINT customer_address_geo_complete CHECK ((region_id IS NULL AND district_id IS NULL AND township_id IS NULL) OR (region_id IS NOT NULL AND district_id IS NOT NULL AND township_id IS NOT NULL));
CREATE INDEX customer_addresses_township_idx ON public.customer_addresses(township_id) WHERE township_id IS NOT NULL;
ALTER TABLE public.delivery_zones
 ADD COLUMN region_id uuid REFERENCES public.geo_regions(id),
 ADD COLUMN district_id uuid,
 ADD COLUMN township_id uuid,
 ADD COLUMN region_name varchar(150),
 ADD COLUMN district_name varchar(150),
 ADD CONSTRAINT delivery_zone_geo_district_fk FOREIGN KEY(district_id,region_id) REFERENCES public.geo_districts(id,region_id),
 ADD CONSTRAINT delivery_zone_geo_township_fk FOREIGN KEY(township_id,district_id) REFERENCES public.geo_townships(id,district_id),
 ADD CONSTRAINT delivery_zone_geo_complete CHECK ((region_id IS NULL AND district_id IS NULL AND township_id IS NULL) OR (region_id IS NOT NULL AND district_id IS NOT NULL AND township_id IS NOT NULL));
CREATE INDEX delivery_zones_canonical_coverage_idx ON public.delivery_zones(restaurant_id,township_id,delivery_fee,minimum_order,id) WHERE is_active;
ALTER TABLE public.orders
 ADD COLUMN delivery_region_id uuid REFERENCES public.geo_regions(id),
 ADD COLUMN delivery_district_id uuid,
 ADD COLUMN delivery_township_id uuid,
 ADD COLUMN delivery_region_name varchar(150),
 ADD COLUMN delivery_district_name varchar(150),
 ADD COLUMN delivery_township_name varchar(150),
 ADD COLUMN delivery_ward varchar(100),
 ADD COLUMN delivery_street varchar(100),
 ADD COLUMN delivery_house_no varchar(50),
 ADD CONSTRAINT order_geo_district_fk FOREIGN KEY(delivery_district_id,delivery_region_id) REFERENCES public.geo_districts(id,region_id),
 ADD CONSTRAINT order_geo_township_fk FOREIGN KEY(delivery_township_id,delivery_district_id) REFERENCES public.geo_townships(id,district_id),
 ADD CONSTRAINT order_geo_complete CHECK ((delivery_region_id IS NULL AND delivery_district_id IS NULL AND delivery_township_id IS NULL) OR (delivery_region_id IS NOT NULL AND delivery_district_id IS NOT NULL AND delivery_township_id IS NOT NULL));
CREATE FUNCTION public.preserve_canonical_delivery_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.delivery_region_id,NEW.delivery_district_id,NEW.delivery_township_id,NEW.delivery_region_name,NEW.delivery_district_name,NEW.delivery_township_name,NEW.delivery_ward,NEW.delivery_street,NEW.delivery_house_no)
  IS DISTINCT FROM ROW(OLD.delivery_region_id,OLD.delivery_district_id,OLD.delivery_township_id,OLD.delivery_region_name,OLD.delivery_district_name,OLD.delivery_township_name,OLD.delivery_ward,OLD.delivery_street,OLD.delivery_house_no) THEN
  RAISE EXCEPTION 'Canonical delivery snapshot is immutable' USING ERRCODE='23514';
 END IF;
 IF (OLD.delivery_township_id IS NOT NULL OR NEW.delivery_township_id IS NOT NULL) AND
  ROW(NEW.restaurant_id,NEW.delivery_zone_id,NEW.delivery_address,NEW.delivery_name,NEW.delivery_phone,NEW.delivery_note,
      NEW.delivery_latitude,NEW.delivery_longitude,NEW.delivery_city,NEW.delivery_township,NEW.created_at,
      NEW.subtotal,NEW.delivery_fee,NEW.discount_amount,NEW.total_amount)
  IS DISTINCT FROM ROW(OLD.restaurant_id,OLD.delivery_zone_id,OLD.delivery_address,OLD.delivery_name,OLD.delivery_phone,OLD.delivery_note,
      OLD.delivery_latitude,OLD.delivery_longitude,OLD.delivery_city,OLD.delivery_township,OLD.created_at,
      OLD.subtotal,OLD.delivery_fee,OLD.discount_amount,OLD.total_amount) THEN
  RAISE EXCEPTION 'Canonical delivery snapshot is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preserve_canonical_delivery_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_preserve_canonical_delivery_snapshot BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.preserve_canonical_delivery_snapshot();
