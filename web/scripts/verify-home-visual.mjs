/** Real Chromium geometry checks at 375px phone and 1440px desktop.
 * Runs against actual Next.js components on a protected CI-only fixture.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import fs from "node:fs";
import {chromium} from "playwright-core";

const root = new URL("../", import.meta.url).pathname;
const port = 32286, base = "http://127.0.0.1:" + port;
const auth = "Basic " + Buffer.from("visual:visual-ci").toString("base64");
const browserPath = ["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"]
  .find(fs.existsSync);
assert.ok(browserPath,"Chromium/Chrome is required for responsive browser checks");
const server = spawn(process.execPath,["./node_modules/next/dist/bin/next","start","-p",String(port)],{
  cwd:root,
  env:{...process.env,SITE_ACCESS:"private",SITE_USER:"visual",SITE_PASSWORD:"visual-ci",
       DATA_MODE:"live",SUPABASE_URL:"",SUPABASE_SECRET_KEY:"",
       AIL_UI_TEST_FIXTURE:"on",VERCEL:""},
  stdio:["ignore","pipe","pipe"],
});
let output="";
server.stdout.on("data",buffer=>{output+=buffer.toString();});
server.stderr.on("data",buffer=>{output+=buffer.toString();});

async function ready(){
  for(let i=0;i<60;i++){
    try{
      const r=await fetch(base+"/visual-layout-check",{headers:{Authorization:auth},signal:AbortSignal.timeout(1300)});
      if(r.status===200)return;
    }catch{}
    if(server.exitCode!==null)throw Error("Test server died: "+output.slice(-2000));
    await delay(350);
  }
  throw Error("Test fixture not available: "+output.slice(-2000));
}
function rect(r){return {left:r.x,right:r.x+r.width,top:r.y,bottom:r.y+r.height};}
let browser;
try{
  await ready();
  browser=await chromium.launch({headless:true,executablePath:browserPath,args:["--no-sandbox"]});
  for(const width of [375,1440]){
    const context=await browser.newContext({
      viewport:{width,height:900},deviceScaleFactor:1,
      extraHTTPHeaders:{Authorization:auth},
    });
    const page=await context.newPage();
    const result=await page.goto(base+"/visual-layout-check",{waitUntil:"networkidle"});
    assert.equal(result?.status(),200,"fixture should only exist inside CI");
    // The 5-item navigation must use the same canonical URL map on desktop
    // and within the hamburger accordion on phones. Old bottom nav/sidebar gone.
    assert.equal(await page.locator('nav[aria-label="Mobile navigation"]').count(),0,
      "legacy bottom bar should never be rendered");
    assert.equal(await page.locator("aside").count(),0,"13-item sidebar must be removed");
    if(width>=1024){
      const primary=page.locator('[data-header-nav="true"]');
      assert.equal(await primary.count(),1,"desktop header navigation missing");
      assert.equal(await primary.locator("[data-top-nav-item]").count(),5);
      assert.equal(await page.locator("[data-mobile-menu-trigger]:visible").count(),0);
      const compare=primary.locator('[data-nav-trigger="compare"]');
      await compare.hover();
      assert.equal(await primary.locator('[data-submenu="compare"] a').count(),4);
      assert.deepEqual(await primary.locator('[data-submenu="compare"] a')
        .evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname)),[
          "/ko/consensus","/ko/performance","/ko/portfolio","/ko/trades",
        ]);
      await page.keyboard.press("Escape");
      assert.equal(await primary.locator('[data-submenu="compare"]').count(),0);
      const research=primary.locator('[data-nav-trigger="research"]');
      await research.click();
      assert.deepEqual(await primary.locator('[data-submenu="research"] a')
        .evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname)),[
          "/ko/patterns","/ko/historical","/ko/accuracy","/ko/weekly",
        ]);
      await page.keyboard.press("Escape");
      const journal=primary.locator('[data-nav-trigger="journal"]');
      await journal.hover();
      assert.deepEqual(await primary.locator('[data-submenu="journal"] a')
        .evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname)),[
          "/ko/daily","/ko/journal","/ko/outcomes",
        ]);
      await page.keyboard.press("Escape");
    }else{
      assert.equal(await page.locator("[data-header-nav]:visible").count(),0);
      const trigger=page.locator('[data-mobile-menu-trigger="true"]');
      assert.equal(await trigger.count(),1,"top hamburger missing");
      await trigger.click();
      const overlay=page.locator('[data-mobile-nav-overlay="true"]');
      assert.equal(await overlay.count(),1,"mobile drawer missing");
      assert.equal(await overlay.locator('[data-mobile-nav-group]').count(),5);
      const compare=overlay.locator('[data-mobile-nav-group="compare"] button');
      await compare.click();
      assert.equal(await compare.getAttribute("aria-expanded"),"true");
      assert.deepEqual(await overlay.locator('[data-mobile-submenu="compare"] a')
        .evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname)),[
          "/ko/consensus","/ko/performance","/ko/portfolio","/ko/trades",
        ]);
      await overlay.locator('[data-mobile-nav-group="research"] button').click();
      assert.equal(await overlay.locator('[data-mobile-submenu="compare"]').count(),0,
        "accordion should have only one open group");
      assert.equal(await overlay.locator('[data-mobile-submenu="research"] a').count(),4);
      await overlay.locator('[data-mobile-nav-group="journal"] button').click();
      assert.equal(await overlay.locator('[data-mobile-submenu="journal"] a').count(),3);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator('[data-mobile-nav-overlay]').count(),0,"Escape must close drawer");
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"","scroll lock not restored");
    }
    const prelaunch=page.locator('[data-prelaunch-fixture="true"] [data-home-phase="pre-first-published-round"]');
    assert.equal(await prelaunch.count(),1,"prelaunch banner should exist in real components");
    const prelaunchSection=prelaunch.locator("section.market-hero");
    assert.equal(await prelaunchSection.count(),1,"one pre-first-round banner only");
    assert.equal(await prelaunchSection.locator("time[datetime='2026-11-23']").count(),1,"actual start date shown once");
    const prelaunchText=await prelaunch.innerText();
    assert.equal((prelaunchText.match(/2026-11-23/g)||[]).length,1,"start date must not be repeated");
    assert.ok(prelaunchText.includes("동일한 미국 주식 1종목의 시장 데이터"),"actual universe size from dataset, not an invented number");
    assert.ok(prelaunchText.includes("$100,000"),"experiment capital must come from real configuration");
    const tierDisclosure=prelaunch.locator('[data-model-disclosure="true"]');
    assert.equal(await tierDisclosure.count(),1,"home methodology must disclose unequal models");
    assert.equal(await tierDisclosure.locator("tbody tr").count(),4,"four pinned models required");
    for(const id of ["gpt","claude","gemini"]){
      assert.ok((await tierDisclosure.locator('[data-tier="'+id+'"]').innerText()).trim(),
        "manufacturer-backed model tier missing: "+id);
    }
    assert.equal((await tierDisclosure.locator('[data-tier="deepseek"]').innerText()).trim(),"",
      "unverified DeepSeek tier must be left blank");
    assert.equal(await tierDisclosure.locator('a[href^="https://"]').count(),4,
      "official manufacturer citations missing");
    assert.equal(await prelaunch.locator('a[href$="/methodology"]').count(),1);
    assert.equal(await prelaunch.locator('a[href$="/historical"]').count(),1);
    assert.equal(await prelaunch.locator('a[href$="/patterns"]').count(),1);
    for(const emptyTitle of ["AI 투자 리더보드","누적 수익률 추이","최근 거래일 매매","AI 의견 충돌","판단 결과 추적","실험 일지","최근 투자 판단과 이유"]){
      assert.ok(!prelaunchText.includes(emptyTitle),"empty live section must be omitted: "+emptyTitle);
    }
    const status=page.locator('[data-home-data-status="true"]:visible');
    assert.equal(await status.count(),1,"exactly one visible as-of status at "+width);
    assert.match(await status.innerText(),/첫 회차 전/,"missing pre-first-round state");
    assert.doesNotMatch(await status.innerText(),/—/,"empty as-of date must not use dash");
    const logos=page.locator('a[aria-label="MarketSights home"]:visible');
    assert.equal(await logos.count(),width<1024?1:1);
    const text=await logos.first().textContent();
    assert.ok(text.includes("· AI 투자 연구소"),"brand/section must contain explicit separator");
    const headline=await page.locator("h1.hero-title").textContent();
    assert.equal(headline.replace(/\s+/g," ").trim(),"하나의 시장, 네 가지 AI의 시선.",
      "hero title must include natural sentence spacing at "+width);
    const legend=page.locator('[data-chart-legend="true"] > li');
    assert.equal(await legend.count(),5);
    assert.deepEqual(await legend.allTextContents(),["GPT","Claude","Gemini","DeepSeek","SPY"]);
    const chips=await legend.all();
    for(const chip of chips){
      const dot=chip.locator("[data-legend-dot]");
      assert.equal(await dot.count(),1);
      const box=await dot.boundingBox();
      assert.ok(box&&box.width>=8&&box.height>=8,"legend color dot missing");
      assert.notEqual(await dot.evaluate(el=>getComputedStyle(el).backgroundColor),"rgba(0, 0, 0, 0)");
    }
    const positions=await Promise.all(chips.map(c=>c.boundingBox()));
    for(let i=1;i<positions.length;i++){
      const prev=positions[i-1],next=positions[i];
      if(Math.abs(prev.y-next.y)<2)assert.ok(next.x-prev.x-prev.width>=6,
        "adjacent legend chips overlap at width "+width);
    }
    assert.equal(await page.locator('[data-universe-state="empty"] [data-holders-hint]').count(),0);
    assert.equal(await page.locator('[data-universe-state="empty"] [data-holder-dot]').count(),0);
    assert.equal(await page.locator('[data-universe-state="held"] [data-holders-hint]').count(),1);
    const holder=page.locator('[data-universe-state="held"] [data-holder-dot]');
    assert.equal(await holder.count(),1);
    assert.equal(await holder.first().getAttribute("aria-label"),"GPT");
    const holderRect=await holder.first().boundingBox();
    assert.ok(holderRect&&holderRect.width>=8&&holderRect.height>=8,"holder dot invisible");

    const lang=page.locator('label[aria-label="Display language"]');
    const langBox=rect(await lang.boundingBox());
    const statusBox=rect(await status.boundingBox());
    if(width>=640){
      assert.ok(langBox.left-statusBox.right>=18,"date and language overlap on desktop");
    }else{
      assert.ok(statusBox.top>=langBox.bottom-1,"mobile status must be on separate row");
      const logoBox=rect(await logos.first().boundingBox());
      assert.ok(langBox.left-logoBox.right>=7,"mobile logo and language overlap");
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=1,"horizontal scrolling at "+width+"px: "+overflow);
    console.log("PASS responsive home UI",width+"px",": separated date/language, explicit brand separator, 5 spaced colored legend chips, conditional holder dots, no overflow");
    await context.close();
  }
}finally{
  await browser?.close();
  server.kill("SIGTERM");
  await delay(300);
  if(server.exitCode===null)server.kill("SIGKILL");
}
