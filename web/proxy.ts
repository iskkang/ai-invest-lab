import { NextResponse, type NextRequest } from "next/server";

/**
 * A public, indexable editorial layer lives at /en, /zh, /ko and /ja.
 * Every private data/dashboard/API route remains protected by Basic auth.
 * "SITE_ACCESS=public" must NOT accidentally publish licensed quote feeds.
 */
const PUBLIC_EDITORIAL = /^\/(en|zh|ko|ja)(?:\/(?:methodology|faq|privacy|advertise))?\/?$/;
const PUBLIC_FILES = new Set([
  "/robots.txt", "/sitemap.xml", "/llms.txt", "/ads.txt",
]);

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const methodSafe = req.method === "GET" || req.method === "HEAD";
  const match = methodSafe ? PUBLIC_EDITORIAL.exec(pathname) : null;

  if ((methodSafe && pathname === "/") || match || (methodSafe && PUBLIC_FILES.has(pathname))) {
    const requestHeaders = new Headers(req.headers);
    if (match || pathname === "/") {
      requestHeaders.set("x-ail-public", "1");
      requestHeaders.set("x-ail-locale", match?.[1] ?? "en");
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const privateHeaders = {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "private, no-store",
  };
  const user = process.env.SITE_USER ?? "lab";
  const pass = process.env.SITE_PASSWORD;
  if (!pass) {
    return new NextResponse("Private dashboard: SITE_PASSWORD is not configured.", {
      status: 503, headers: privateHeaders,
    });
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch { /* invalid credential */ }
    const [u, ...rest] = decoded.split(":");
    if (u === user && rest.join(":") === pass) {
      const safeHeaders = new Headers(req.headers);
      safeHeaders.delete("x-ail-public");
      safeHeaders.delete("x-ail-locale");
      const response = NextResponse.next({ request: { headers: safeHeaders } });
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      ...privateHeaders,
      "WWW-Authenticate": 'Basic realm="AI Invest Lab (private)", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
