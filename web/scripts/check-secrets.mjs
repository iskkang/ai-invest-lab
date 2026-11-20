// 키 노출 검사: (1) 클라이언트 번들에 서버 비밀 변수명이 나오지 않는지
// (2) 비밀이 NEXT_PUBLIC_ 로 선언되지 않았는지 (3) 저장소에 키 형태 문자열이 없는지
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SECRET_NAMES = ["OPENROUTER_API_KEY", "NHPLUG_APP_KEY", "NHPLUG_APP_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "SITE_PASSWORD", "SUPABASE_ANON_KEY"];
const KEY_PATTERNS = [/sk-or-v1-[0-9a-f]{20,}/, /eyJhbGciOi[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/];
const problems = [];
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".git", ".next"].includes(f)) continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
// (1) 'use client' 파일과 브라우저 번들
for (const f of walk(".").filter((f) => /\.(tsx?|mjs)$/.test(f) && !f.includes("scripts/"))) {
  const src = readFileSync(f, "utf8");
  if (src.startsWith('"use client"') && SECRET_NAMES.some((n) => src.includes(n))) problems.push(`client file references secret env: ${f}`);
  if (/NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|PASSWORD|SERVICE)/.test(src)) problems.push(`secret-looking NEXT_PUBLIC_ var in ${f}`);
}
const staticDir = ".next/static";
if (existsSync(staticDir)) {
  for (const f of walk(staticDir)) {
    const src = readFileSync(f, "utf8");
    for (const n of SECRET_NAMES) if (src.includes(n)) problems.push(`browser bundle mentions ${n}: ${f}`);
    for (const pat of KEY_PATTERNS) if (pat.test(src)) problems.push(`key-like string in bundle: ${f}`);
  }
}
// (3) 저장소 전체(상위 폴더 포함)
for (const f of walk("..").filter((f) => !/\.(png|jpg|ico|lock)$/.test(f) && !f.includes("node_modules"))) {
  let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
  for (const pat of KEY_PATTERNS) if (pat.test(src)) problems.push(`key-like string in ${f}`);
  if (/(^|\/)\.env$/.test(f)) problems.push(`.env file present in tree: ${f} (do not commit)`);
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("secret check passed");
