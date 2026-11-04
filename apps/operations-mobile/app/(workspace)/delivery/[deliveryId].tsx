import { useLocalSearchParams } from "expo-router";
import { ScreenGuard } from "../../../src/navigation/ScreenGuard";
import { DeliveryDetailScreen } from "../../../src/features/operations/DeliveryDetailScreen";

export default function DeliveryDetailRoute() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  return <ScreenGuard screenId="deliveries"><DeliveryDetailScreen deliveryId={deliveryId} /></ScreenGuard>;
}
