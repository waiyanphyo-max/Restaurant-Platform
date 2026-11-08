import { useLocalSearchParams } from "expo-router";
import { safeMobileDestination } from "@restaurant-platform/restaurant-config/mobile-runtime";
import AccessScreen from "./index";

export default function OpenOperationsLink() {
  const { destination } = useLocalSearchParams();
  return <AccessScreen destination={safeMobileDestination(destination, "operations") ?? "/dashboard"} />;
}
