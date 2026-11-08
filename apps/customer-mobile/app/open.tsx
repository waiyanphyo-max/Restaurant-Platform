import { useLocalSearchParams } from "expo-router";
import { safeMobileDestination } from "@restaurant-platform/restaurant-config/mobile-runtime";
import SignIn from "./index";

export default function OpenCustomerLink() {
  const { destination } = useLocalSearchParams();
  return <SignIn destination={safeMobileDestination(destination, "customer") ?? "/home"} />;
}
