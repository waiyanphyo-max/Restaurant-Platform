import type { ComponentProps } from "react";
import { Link } from "expo-router";
import type { TextStyle } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { useUiTheme } from "../components/ui";

/** A normal Router text link with the workspace's semantic colors and minimum touch target. */
export function WorkspaceLink({ style, ...props }: ComponentProps<typeof Link>) {
  const { color } = useUiTheme();
  return <Link {...props} allowFontScaling accessibilityRole="link" style={[linkStyle, { color: color.primary }, style]} />;
}

const linkStyle = { ...foundationTokens.typography.body, minHeight: foundationTokens.density.touchTarget,
  paddingVertical: foundationTokens.spacing.sm + foundationTokens.spacing.xs } satisfies TextStyle;
