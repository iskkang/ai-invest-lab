"""모바일 화면 점검 (필수 테스트 15). 실행: next start 후
   SITE_URL=http://localhost:3000 SITE_USER=lab SITE_PASSWORD=... python web/tests/mobile_check.py
검사: 주요 페이지 200 응답, 가로 넘침 없음, 하단 내비 표시, 차트 렌더(canvas), JS 오류 없음, 스크린샷 저장."""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SITE_URL", "http://localhost:3000")
CREDS = {"username": os.environ.get("SITE_USER", "lab"), "password": os.environ.get("SITE_PASSWORD", "")}
PAGES = {"/": True, "/portfolio": False, "/trades": False, "/performance": True, "/about": False, "/ai/gpt": True, "/stocks/AAPL": True}
fails, errors = [], []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, http_credentials=CREDS)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    for path, needs_chart in PAGES.items():
        r = page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(500)
        if r.status != 200: fails.append(f"{path}: HTTP {r.status}")
        if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"): fails.append(f"{path}: horizontal overflow")
        if not page.locator("nav[aria-label='모바일 내비게이션']").is_visible(): fails.append(f"{path}: bottom nav hidden")
        if needs_chart and page.locator("canvas").count() == 0: fails.append(f"{path}: chart not rendered")
        small = page.evaluate("[...document.querySelectorAll('nav[aria-label=\"모바일 내비게이션\"] a')].filter(a=>a.getBoundingClientRect().height<44).length")
        if small: fails.append(f"{path}: {small} nav targets < 44px")
        page.screenshot(path=f"mobile{path.replace('/', '_') or '_home'}.png")
    b.close()
print("\n".join(fails + errors) or "mobile check passed")
sys.exit(1 if fails or errors else 0)
