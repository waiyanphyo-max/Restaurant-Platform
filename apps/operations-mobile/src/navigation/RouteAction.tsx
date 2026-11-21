import type { ComponentProps } from "react";
import { useRouter, type Href } from "expo-router";
import { Action } from "../components/ui";

/** Navigation through the existing accessible Action without platform-specific Link event injection. */
export function RouteAction({ href, ...props }: Omit<ComponentProps<typeof Action>, "onPress"> & { href: Href }) {
  const router = useRouter();
  return <Action {...props} onPress={() => router.navigate(href)} />;
}
