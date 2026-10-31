import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return <main className="standalone-page"><Brand /><section className="standalone-card"><p className="overline">PAGE NOT FOUND · 404</p><h1>Let’s get you back on track</h1><p>This page is unavailable. Return to your platform workspace.</p><Link className="button button-primary" href="/">Back to overview</Link></section></main>;
}
