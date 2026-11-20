import { NextResponse, type NextRequest } from "next/server";

/**
 * 비공개 개발 모드 게이트.
 * NH 시세의 공개 재표시·재배포 권한이 확인되기 전에는 SITE_ACCESS 를 'public' 으로 바꾸지 마세요.
 * SITE_ACCESS=private (기본) → HTTP Basic 인증(SITE_USER / SITE_PASSWORD) 필요.
 */
export function proxy(req: NextRequest) {
  if (process.env.SITE_ACCESS === "public") return NextResponse.next();
  const user = process.env.SITE_USER ?? "lab";
  const pass = process.env.SITE_PASSWORD;
  if (!pass) {
    return new NextResponse("Private mode: SITE_PASSWORD is not configured.", { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, ...rest] = atob(encoded).split(":");
    if (u === user && rest.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AI Invest Lab (private)", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
