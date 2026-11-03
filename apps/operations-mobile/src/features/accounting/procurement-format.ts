import { isIsoDate } from "../operations/format";

export function procurementMoney(value:string):string {
  return /^-?\d+$/.test(value)?value.replace(/\B(?=(\d{3})+(?!\d))/g,","):"Amount unavailable";
}
export function procurementToday(timezone:string,instant=new Date()):string {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function purchaseQuantity(value:string):string {
  if(!/^\d{1,12}(\.\d{1,6})?$/.test(value)||!/[1-9]/.test(value))throw new Error("Quantity must be positive with up to six decimal places.");
  return value;
}
export function purchaseWholeAmount(value:string,positive=false):string {
  if(!/^\d+$/.test(value)||value.length>19||BigInt(value)>9223372036854775807n||(positive&&BigInt(value)===0n))throw new Error("Enter a valid whole-currency amount.");
  return BigInt(value).toString();
}
export function purchaseTimestamp(value:string):string {
  const timestamp=value.trim();
  if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(timestamp)||!isIsoDate(timestamp.slice(0,10))||Number.isNaN(Date.parse(timestamp)))throw new Error("Enter a timestamp with timezone, such as 2026-11-02T09:30:00+06:30.");
  return timestamp;
}

export function purchaseOccurrence(value:string,timezone:string,now=new Date()):{ purchaseDate:string; purchasedAt:string } {
  const purchasedAt=purchaseTimestamp(value);
  const instant=new Date(purchasedAt);
  if(instant>now)throw new Error("The purchase timestamp must be at or before the current time.");
  return { purchaseDate:procurementToday(timezone,instant), purchasedAt };
}
