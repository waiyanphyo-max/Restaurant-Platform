import type { Uuid } from "./api.js";

/** Global, read-only reference data. Labels never authorize delivery coverage. */
export interface GeoLocationDto {
  id: Uuid;
  code: string;
  nameEn: string;
  nameMy: string | null;
  regionId?: Uuid | null;
  districtId?: Uuid | null;
}

export interface CanonicalLocation {
  regionId?: Uuid | null;
  districtId?: Uuid | null;
  townshipId?: Uuid | null;
  regionName?: string | null;
  districtName?: string | null;
}

export interface LocationSelection {
  regionId: string;
  districtId: string;
  townshipId: string;
  regionName: string;
  districtName: string;
  township: string;
}
