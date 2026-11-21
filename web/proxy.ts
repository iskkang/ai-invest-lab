import { NextResponse, type NextRequest } from "next/server";

/**
 * Public research results have language-prefixed read-only routes.
 * DB/admin/health endpoints and any unlisted paths stay protected.
 * Do not trust client-supplied x-ail-* headers.
 */
const LOCALE_APP = /^\/(en|zh|ko|ja)(?:\/(?:portfolio|trades|performance|about|methodology|faq|privacy|ai\/(?:gpt|claude|gemini|deepseek)|stocks\/[A-Z0-9.-]+))?\/?$/i;
const PUBLIC_FILES = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt", "/ads.txt"]);

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const safe = req.method === "GET" || req.method === "HEAD";
  const locale = safe ? LOCALE_APP.exec(pathname) : null;
  if ((safe && (pathname === "/" || pathname === "/lab")) || locale || (safe && PUBLIC_FILES.has(pathname))) {
    const headers = new Headers(req.headers);
    headers.delete("x-ail-public");
    headers.delete("x-ail-locale");
    if (locale || pathname === "/" || pathname === "/lab") {
      headers.set("x-ail-public", "1");
      headers.set("x-ail-locale", locale?.[1].toLowerCase() ?? "ko");
    }
    return NextResponse.next({ request: { headers } });
  }

  const privateHeaders = {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "private, no-store",
  };
  const user = process.env.SITE_USER ?? "lab";
  const pass = process.env.SITE_PASSWORD;
  if (!pass) {
    return new NextResponse("Private endpoint: password is not configured.", {
      status: 503, headers: privateHeaders,
    });
  }
  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch { /* invalid Basic header */ }
    const [u, ...rest] = decoded.split(":");
    if (u === user && rest.join(":") === pass) {
      const headers = new Headers(req.headers);
      headers.delete("x-ail-public");
      headers.delete("x-ail-locale");
      const response = NextResponse.next({ request: { headers } });
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      ...privateHeaders,
      "WWW-Authenticate": 'Basic realm="AI Invest Lab private API", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
