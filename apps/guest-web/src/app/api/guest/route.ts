import { handleGuestApi } from "@/lib/guest-api";

export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleGuestApi(request); }
