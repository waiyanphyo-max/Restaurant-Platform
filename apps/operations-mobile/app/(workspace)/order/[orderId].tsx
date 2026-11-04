import { useLocalSearchParams } from "expo-router";
import { ScreenGuard } from "../../../src/navigation/ScreenGuard";
import { OrderDetailScreen } from "../../../src/features/operations/OrderDetailScreen";

export default function OrderDetailRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <ScreenGuard screenId="orders"><OrderDetailScreen key={orderId} orderId={orderId} /></ScreenGuard>;
}
