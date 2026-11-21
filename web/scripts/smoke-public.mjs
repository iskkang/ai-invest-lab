/** HTTP regression: four-language original dashboard + private API gate. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const root=new URL("../",import.meta.url).pathname;
const port=32284;
const base=`http://127.0.0.1:${port}`;
const server=spawn("node",["./node_modules/next/dist/bin/next","start","-p",String(port)],{
  cwd:root,
  env:{...process.env,DATA_MODE:"live",SITE_ACCESS:"private",SITE_USER:"ci",SITE_PASSWORD:"integration-test",SUPABASE_URL:"",SUPABASE_SECRET_KEY:""},
  stdio:["ignore","pipe","pipe"],
});
let output="";
server.stdout.on("data",b=>{output+=String(b)});
server.stderr.on("data",b=>{output+=String(b)});
async function ready(){
  for(let i=0;i<55;i++){
    if(server.exitCode!==null)throw Error("Next server exited early");
    try{
      const r=await fetch(base+"/robots.txt",{signal:AbortSignal.timeout(1500)});
      if(r.ok)return;
    }catch{}
    await sleep(500);
  }
  throw Error("Server did not start: "+output.slice(-1000));
}
async function req(path,options={}){
  return fetch(base+path,{redirect:"manual",signal:AbortSignal.timeout(8000),...options});
}
async function visible(path,needle) {
  const r=await req(path);
  assert.equal(r.status,200,`public route did not return HTTP 200: ${path}`);
  assert.equal(r.headers.get("www-authenticate"),null);
  const html=await r.text();
  assert.ok(html.includes(needle),`missing translated content in ${path}`);
  assert.doesNotMatch(r.headers.get("x-robots-tag")||"",/noindex/);
}
try{
  await ready();
  for(const path of ["/","/lab"]){
    const res=await req(path);
    assert.ok([301,302,303,307,308].includes(res.status),`expected redirect ${path}`);
    assert.equal(new URL(res.headers.get("location"),base).pathname,"/ko");
  }
  for (const [locale,heading] of Object.entries({
    ko:"투자 데이터 화면을 불러오지 못했습니다.",
    en:"Unable to load investment data.",
    zh:"无法加载投资数据。",
    ja:"投資データを読み込めません。",
  })) {
    await visible(`/${locale}`,heading);
    const res=await req(`/${locale}`);
    const html=await res.text();
    if(locale!=="ko") {
      assert.ok(!html.includes("투자 데이터 화면을 불러오지 못했습니다."),`Korean dashboard error leaked into ${locale}`);
      assert.ok(!html.includes('href="/ko/methodology"'),`wrong-locale methodology link in ${locale}`);
      assert.ok(html.includes(`href="/${locale}/methodology"`),`localized methodology link missing in ${locale}`);
    }
  }
  // Each full document must agree on locale across <html>, app shell,
  // dropdown, bottom navigation and on-page localized content.
  const navExpected = {
    ko: { dashboard: "대시보드", performance: "성과", language: "한국어" },
    en: { dashboard: "Dashboard", performance: "Performance", language: "English" },
    zh: { dashboard: "仪表盘", performance: "投资表现", language: "简体中文" },
    ja: { dashboard: "ダッシュボード", performance: "パフォーマンス", language: "日本語" },
  };
  for (const [locale, labels] of Object.entries(navExpected)) {
    const res = await req(`/${locale}`);
    assert.equal(res.status, 200, `wrong locale HTTP status: ${locale}`);
    const html = await res.text();
    assert.ok(html.includes(`data-active-locale="${locale}"`),
      `root app shell is not using ${locale}`);
    assert.ok(html.includes(`lang="${locale === "zh" ? "zh-CN" : locale}"`),
      `document <html lang> not ${locale}`);
    assert.ok(html.includes(labels.language),
      `missing selected language label ${labels.language}`);
    assert.ok(html.includes(`href="/${locale}/performance"`),
      `bottom/side navigation links leaked another locale: ${locale}`);
    assert.ok(html.includes(`href="/${locale}/trades"`),
      `trades links leaked another locale: ${locale}`);
    assert.ok(html.includes(labels.dashboard), `missing translated navigation: ${locale}`);
    assert.ok(html.includes(labels.performance), `missing translated performance: ${locale}`);
    assert.ok(html.includes('aria-haspopup="dialog"'),"Mobile More entry must expose secondary pages");
    assert.ok(html.includes('min-h-[61px]') || html.includes('min-h-\[61px\]'),
      "Bottom navigation needs accessible tap targets");
    for (const other of Object.keys(navExpected).filter((x) => x !== locale)) {
      assert.ok(!html.includes(`href="/${other}/performance"`),
        `mixed-language navigation in ${locale}: unexpected ${other}`);
    }
  }
  await visible("/ko/about","AI는 실제로 주식투자를 잘할까?");
  // Four-language insight routes must be public even with no DB credentials.
  for (const [locale,heading] of Object.entries({
    ko:"AI가 시장을 보는 서로 다른 시각",
    en:"See how AI models interpret the same market",
    zh:"比较不同 AI 对同一市场的判断",
    ja:"同じ市場に対するAIの見方を比較",
  })) {
    for (const suffix of ["consensus","daily","outcomes","weekly","accuracy"]) {
      await visible("/"+locale+"/"+suffix,heading);
    }
  }
  // Regression: only the selected nav item may have aria-current=page.
  // Root /en must NOT activate on descendant /en/weekly or /en/consensus.
  for (const locale of ["en","ko","zh","ja"]) {
    for (const section of ["weekly","consensus","accuracy","historical"]) {
      const pathname="/"+locale+"/"+section;
      const html=await (await req(pathname)).text();
      const anchors=[...html.matchAll(/<a\b[^>]*>/g)].map(match=>match[0]);
      const selected=anchors.filter(a=>a.includes('aria-current="page"'))
        .map(a=>a.match(/href="([^"]+)"/)?.[1]).filter(Boolean);
      const direct=["weekly","consensus","historical"].includes(section);
      assert.deepEqual(selected,direct?[pathname,pathname]:[pathname],
        "Mobile More menu must not mark hidden routes as a different tab: "+pathname);
    }
  }
  // Historical research is public in four languages but FAILS CLOSED if real
  // NH PLUG market data is not configured. No synthetic returns in web mode.
  for (const [locale,headline] of Object.entries({
    ko:"과거 시장에서 어떤 투자 규칙이 유리했을까?",
    en:"Which fixed rules worked in the historical market?",
    zh:"哪些固定规则在历史行情中表现更好？",
    ja:"過去の市場で有効だった固定ルールは？",
  })){
    await visible("/"+locale+"/historical",headline);
    const html=await (await req("/"+locale+"/historical")).text();
    assert.ok(!html.includes("Simulated total return</"),"Data outage must not fabricate research returns");
    const anchors=[...html.matchAll(/<a\b[^>]*>/g)].map(match=>match[0]);
    const selected=anchors.filter(a=>a.includes('aria-current="page"'))
      .map(a=>a.match(/href="([^"]+)"/)?.[1]).filter(Boolean);
    assert.deepEqual(selected,["/"+locale+"/historical","/"+locale+"/historical"],
      "Only historical nav should be selected: "+locale);
  }
  const unpublished=await req("/ko/weekly/2026-W48");
  assert.ok([200,404].includes(unpublished.status),"Unexpected unpublished report status");
  if(unpublished.status===200) {
    const body=await unpublished.text();
    assert.ok(body.includes("투자 데이터를 가져오지 못했습니다."),
      "Data-outage response must explicitly disclose missing real data");
    assert.ok(!body.includes("해당 주간 계좌 수익률"),
      "No invented weekly return can be rendered without real data");
  }
  await visible("/en/methodology","Comparable information");
  await visible("/ko/faq","실제 주식을 사거나");
  await visible("/zh/privacy","数据处理");
  // Without live DB credentials, data-dependent detail pages may return 500.
  // They must never silently serve synthesized investment performance.
  const aiUnavailable = await req("/en/ai/gpt");
  assert.equal(aiUnavailable.status,500,"unavailable LIVE AI detail must fail closed");
  const aiHtml = await aiUnavailable.text();
  assert.ok(!aiHtml.includes("DEMO —"),"unavailable AI page must never show demo data");
  await visible("/robots.txt","/sitemap.xml");
  await visible("/llms.txt","# MarketSights");
  await visible("/ads.txt","No advertising sellers");
  const deploymentStatus = await req("/status");
  assert.equal(deploymentStatus.status,200,"public build probe unavailable");
  const probe = await deploymentStatus.json();
  assert.equal(probe.service,"MarketSights");
  assert.equal(probe.component,"web");
  assert.equal(probe.dataMode,"live");
  assert.equal(probe.demoEnabled,false);
  assert.equal(deploymentStatus.headers.get("cache-control"),"no-store");
  const map=await req("/sitemap.xml");
  assert.equal(map.status,200);
  const sitemap=await map.text();
  for(const locale of ["en","zh","ko","ja"]){
    for(const suffix of ["portfolio","trades","performance","consensus","daily","outcomes","weekly","accuracy","historical","ai/gpt"]){
      assert.ok(sitemap.includes(`/${locale}/${suffix}`),`sitemap missing ${locale}/${suffix}`);
    }
  }
  for(const path of ["/api/health/db","/portfolio","/trades","/performance","/ai/gpt","/stocks/AAPL","/en/advertise"]){
    const res=await req(path);
    assert.equal(res.status,401,`private path unexpectedly accessible: ${path}`);
    assert.match(res.headers.get("x-robots-tag")||"",/noindex/);
  }
  console.log("PASS: live-only site, no synthetic dataset, SEO and protected APIs.");
}finally{
  server.kill("SIGTERM");
  await sleep(500);
  if(server.exitCode===null)server.kill("SIGKILL");
}
