import type { ComponentProps } from "react";
import { useRouter, type Href } from "expo-router";
import { Action } from "../components/ui";
import { useDraftNavigation } from "../hooks/useUnsavedChanges";

/** Navigation through the existing accessible Action without platform-specific Link event injection. */
export function RouteAction({ href, ...props }: Omit<ComponentProps<typeof Action>, "onPress"> & { href: Href }) {
  const router = useRouter();
  const { requestNavigation } = useDraftNavigation();
  return <Action {...props} onPress={() => requestNavigation(() => router.navigate(href))} />;
}
