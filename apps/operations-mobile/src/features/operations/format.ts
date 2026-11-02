/** Preserve the existing operational wire value; never infer cents or COGS. */
export function operationalAmount(value: number): string {
  return Number.isSafeInteger(value) ? value.toLocaleString("en-US") : "Amount unavailable";
}

export function exactTimestamp(value: string): string {
  // Keep the server offset visible; never silently use the device business date.
  return Number.isNaN(Date.parse(value)) ? "Timestamp unavailable" : value;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
