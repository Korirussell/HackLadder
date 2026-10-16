import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Keeps the Supabase session cookie fresh on routes that use auth. This is not the
// authorization check: every admin page and action verifies is_admin() on the server.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If Supabase falls back to the Site URL (a redirect URL not on its allow list), the sign-in
  // code lands on the homepage. Send it to the callback so the sign-in still completes.
  if (request.nextUrl.pathname === "/") {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.next();
    const callback = new URL("/auth/callback", request.nextUrl.origin);
    callback.searchParams.set("code", code);
    return NextResponse.redirect(callback);
  }

  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  try {
    await refreshSession(request, url, key, (r) => (response = r));
  } catch (error) {
    // Refreshing the cookie is a convenience; pages still enforce access themselves. A bad
    // Supabase setting shouldn't take every auth page down, so log it and serve the page.
    console.error("proxy: couldn't refresh the Supabase session", error);
  }
  return response;
}

async function refreshSession(
  request: NextRequest,
  url: string,
  key: string,
  setResponse: (response: NextResponse) => void,
) {
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        const response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
        setResponse(response);
      },
    },
  });
  // Refreshes the access token if it has expired.
  await supabase.auth.getClaims();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/sign-in", "/auth/:path*"],
};
