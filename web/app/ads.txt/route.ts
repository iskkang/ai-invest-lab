import { NextResponse } from "next/server";

/**
 * AdSense inventory is deliberately dormant until publisher approval.
 * Set ADSENSE_PUBLISHER_ID=pub-<16 digits> after approval.
 * A valid ads.txt prevents unauthorized seller declarations.
 */
export async function GET() {
  const publisherId = process.env.ADSENSE_PUBLISHER_ID?.trim() ?? "";
  if (!/^pub-\d{16}$/.test(publisherId)) {
    return new NextResponse("# No advertising sellers are currently authorized.\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }
  return new NextResponse(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
