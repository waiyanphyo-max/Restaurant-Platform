import { handleGuestApi } from "@/lib/guest-api";

export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleGuestApi(request, (await params).slug);
}
