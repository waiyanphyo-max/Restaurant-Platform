import { Link } from "expo-router";
import { Page, Body } from "../src/components/ui";

export default function NotFoundScreen() {
  return <Page title="Screen unavailable"><Body>This screen is unavailable in this Operations app.</Body><Link href="/">Open workspace</Link></Page>;
}
