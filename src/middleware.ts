import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Demo mode: skip auth check
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return await updateSession(request);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|auth|api/cron).*)",
  ],
};
