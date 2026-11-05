import { Link } from "expo-router";
import { Page, Body } from "../src/components/ui";
export default function NotFound() { return <Page title="Page unavailable"><Body>This page is unavailable in this app.</Body><Link href="/">Return home</Link></Page>; }
