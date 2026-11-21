/** English-only HTTP, SEO, redirects and private-route regression checks. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const root = new URL("../", import.meta.url).pathname;
const port = 32284, base = "http://127.0.0.1:" + port;
const server = spawn("node", ["./node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, DATA_MODE: "live", SITE_ACCESS: "private", SITE_USER: "ci",
    SITE_PASSWORD: "integration-test", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", b => { output += String(b); });
server.stderr.on("data", b => { output += String(b); });
const req = (path, opts = {}) => fetch(base + path, {
  redirect: "manual", signal: AbortSignal.timeout(8000), ...opts,
});
async function ready() {
  for(let i=0;i<55;i++){
    if(server.exitCode!==null)throw Error("Next server exited early: "+output.slice(-1500));
    try { if((await req("/robots.txt")).ok)return; } catch {}
    await sleep(500);
  }
  throw Error("Server did not start: "+output.slice(-1500));
}
async function visible(path, needle) {
  const r=await req(path);
  assert.equal(r.status,200,"Public English route failed: "+path);
  assert.equal(r.headers.get("www-authenticate"),null);
  const html=await r.text();
  assert.ok(html.includes(needle),"Expected English content missing: "+path);
  assert.doesNotMatch(r.headers.get("x-robots-tag")||"",/noindex/);
  return html;
}
try {
  await ready();
  const redirected=[
    ["/","/en"], ["/lab","/en"], ["/ko","/en"], ["/zh","/en"], ["/ja","/en"],
    ["/ko/about","/en/about"], ["/zh/methodology","/en/methodology"],
    ["/ja/privacy","/en/privacy"], ["/ko/patterns/fibonacci-618","/en/patterns/fibonacci-618"],
    ["/zh/weekly/2026-W48?source=legacy","/en/weekly/2026-W48?source=legacy"],
    ["/ko/stocks/AAPL?tab=chart","/en/stocks/AAPL?tab=chart"],
  ];
  for (const [from,to] of redirected) {
    const res=await req(from);
    assert.equal(res.status,301,"Expected permanent redirect for "+from);
    const url=new URL(res.headers.get("location"),base);
    assert.equal(url.pathname+url.search,to,"Wrong permanent redirect for "+from);
  }
  const dashboard=await visible("/en","Unable to load investment data.");
  assert.ok(dashboard.includes('data-active-locale="en"'));
  assert.ok(dashboard.includes('lang="en"'));
  assert.ok(!dashboard.includes('aria-label="Display language"'),"Language selector must be removed");
  assert.ok(!dashboard.includes("투자 데이터 화면을 불러오지 못했습니다."));
  assert.ok(dashboard.includes('href="/en/methodology"'),"English methodology link missing");
  assert.ok(dashboard.includes('data-header-nav="true"'));
  for(const [id,label] of Object.entries({
    dashboard:"Dashboard", compare:"AI comparison", research:"Research",
    journal:"Journal", about:"About",
  })){
    assert.ok(dashboard.includes('data-top-nav-item="'+id+'"'),"Missing menu "+id);
    assert.ok(dashboard.includes(label),"Missing menu translation "+id);
  }
  for(const legacy of ["ko","zh","ja"]){
    assert.ok(!dashboard.includes('href="/'+legacy+'/'),"Old link in HTML: "+legacy);
    assert.ok(!dashboard.includes('hreflang="'+legacy+'"'),"Old hreflang: "+legacy);
  }
  assert.ok(!dashboard.includes('hreflang="zh-CN"'));
  // One active language may be canonical-only; no hreflang is required.
  await visible("/en/about","Can AI make better stock decisions?");
  for(const suffix of ["about","methodology"]){
    const html=await visible("/en/"+suffix,"Engine settings (configured defaults)");
    for(const model of ["openai/gpt-4.1-mini","anthropic/claude-sonnet-5.5",
      "google/gemini-3.8-flash","deepseek/deepseek-v3.2"]){
      assert.ok(html.includes(model),"Missing default model "+model+" on "+suffix);
    }
    assert.ok(html.includes("09:15")&&html.includes("22:15")&&html.includes("23:15"));
    assert.ok(html.includes("0 bp (0%)")&&html.includes("5 bp (0.05%)"));
  }
  await visible("/en/faq","FAQ");
  await visible("/en/privacy","Privacy");
  for(const suffix of ["consensus","daily","outcomes","journal","weekly","accuracy"]){
    await visible("/en/"+suffix,"See how AI models interpret the same market");
  }
  for(const [suffix,group] of Object.entries({
    weekly:"research", consensus:"compare", accuracy:"research", historical:"research",
    daily:"journal", outcomes:"journal", journal:"journal", patterns:"research",
  })){
    const html=await (await req("/en/"+suffix)).text();
    assert.deepEqual([...html.matchAll(/data-active-group="([^"]+)"/g)].map(x=>x[1]),[group]);
  }
  await visible("/en/historical","Which fixed rules worked in the historical market?");
  await visible("/en/patterns","Do famous trading patterns actually hold up?");
  await visible("/en/patterns/fibonacci-618","Do famous trading patterns actually hold up?");
  const unpublished=await req("/en/weekly/2026-W48");
  assert.ok([200,404].includes(unpublished.status),"Unexpected unpublished report status");
  const aiUnavailable=await req("/en/ai/gpt");
  assert.equal(aiUnavailable.status,500,"Unavailable live AI detail must fail closed");
  assert.ok(!(await aiUnavailable.text()).includes("DEMO —"));
  await visible("/robots.txt","/sitemap.xml");
  await visible("/llms.txt","# MarketSights");
  await visible("/ads.txt","No advertising sellers");
  const health=await req("/status");
  assert.equal(health.status,200);
  const probe=await health.json();
  assert.equal(probe.component,"web");
  assert.equal(probe.dataMode,"live");
  assert.equal(probe.demoEnabled,false);
  assert.equal(health.headers.get("cache-control"),"no-store");
  const map=await req("/sitemap.xml");
  assert.equal(map.status,200);
  const sitemap=await map.text();
  for(const suffix of ["portfolio","trades","performance","consensus","daily","outcomes","weekly",
    "accuracy","historical","patterns","patterns/fibonacci-618","ai/gpt"]){
    assert.ok(sitemap.includes("/en/"+suffix),"Missing English sitemap URL "+suffix);
  }
  for(const old of ["/ko","/zh","/ja", 'hreflang="ko"', 'hreflang="zh-CN"', 'hreflang="ja"']){
    assert.ok(!sitemap.includes(old),"Retired locale in sitemap: "+old);
  }
  for(const path of ["/visual-layout-check","/api/health/db","/portfolio","/trades","/performance",
    "/ai/gpt","/stocks/AAPL","/en/advertise"]){
    const r=await req(path);
    assert.equal(r.status,401,"Private endpoint unexpectedly accessible: "+path);
    assert.match(r.headers.get("x-robots-tag")||"",/noindex/);
  }
  console.log("PASS: English-only routes, 301 legacy redirects, SEO, public pages and private gates.");
} finally {
  server.kill("SIGTERM");
  await sleep(500);
  if(server.exitCode===null)server.kill("SIGKILL");
}
