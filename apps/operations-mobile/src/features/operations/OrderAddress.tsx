import type { OrderDeliveryAddressDto } from "@restaurant-platform/shared-types";
import { Body } from "../../components/ui";

export function OrderAddress({ destination }: { destination: OrderDeliveryAddressDto }) {
  return <>
    <Body>Delivery address</Body>
    <Body>Region / State: {destination.region ?? "Historical value unavailable"}</Body>
    <Body>District: {destination.district ?? "Historical value unavailable"}</Body>
    <Body>Township: {destination.township ?? "Historical value unavailable"}</Body>
    {destination.ward ? <Body>Ward / Neighborhood: {destination.ward}</Body> : null}
    {destination.street ? <Body>Street: {destination.street}</Body> : null}
    {destination.houseNo ? <Body>House / Building: {destination.houseNo}</Body> : null}
    <Body>{destination.formattedAddress}</Body>
    <Body>Recipient: {destination.recipientName} · {destination.recipientPhone}</Body>
    {destination.instructions ? <Body>Delivery instructions: {destination.instructions}</Body> : null}
    <Body>Township coverage is preliminary. Review the ward and street before accepting.</Body>
  </>;
}
