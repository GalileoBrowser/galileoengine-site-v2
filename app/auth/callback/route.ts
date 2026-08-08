import { NextResponse, type NextRequest } from "next/server";
import { safeStudioNextPath } from "@/lib/journal/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function noStoreRedirect(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeStudioNextPath(url.searchParams.get("next"));

  if (!isSupabaseConfigured || !code) {
    return noStoreRedirect(new URL("/login?error=callback", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return noStoreRedirect(new URL("/login?error=callback", url.origin));
  }

  return noStoreRedirect(new URL(nextPath, url.origin));
}
