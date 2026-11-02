import { isIsoDate } from "../operations/format";

export function procurementMoney(value:string):string {
  return /^-?\d+$/.test(value)?value.replace(/\B(?=(\d{3})+(?!\d))/g,","):"Amount unavailable";
}
export function procurementToday(timezone:string):string {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function procurementPeriod(mode:"DAY"|"MONTH"|"RANGE",date:string,month:string,from:string,to:string):{from:string;to:string} {
  if(mode==="DAY") {
    if(!isIsoDate(date))throw new Error("Enter a valid purchase date.");
    return {from:date,to:date};
  }
  if(mode==="MONTH") {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("Enter a valid month as YYYY-MM.");
    const year=Number(month.slice(0,4)),monthNumber=Number(month.slice(5));
    return {from:`${month}-01`,to:`${month}-${new Date(Date.UTC(year,monthNumber,0)).getUTCDate()}`};
  }
  if(!isIsoDate(from)||!isIsoDate(to)||to<from)throw new Error("Enter a valid date range in chronological order.");
  return {from,to};
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
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)||!isIsoDate(value.slice(0,10))||Number.isNaN(Date.parse(value)))throw new Error("Enter a timestamp with timezone, such as 2026-11-02T09:30:00+06:30.");
  return value;
}
