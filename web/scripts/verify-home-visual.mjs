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
    // Mobile bottom navigation is intentional. Desktop keeps the five-item header.
    const bottomNav=page.locator('nav[data-bottom-tabs][aria-label="Mobile navigation"]');
    if(width<768){
      assert.equal(await bottomNav.count(),1,"mobile bottom navigation must exist");
      assert.equal(await bottomNav.locator('a').count(),4,"four destination tabs");
      assert.equal(await bottomNav.locator('button[aria-haspopup="dialog"]').count(),1,"More tab");
      for(const item of await bottomNav.locator('a,button').all()){
        const box=await item.boundingBox();
        assert.ok(box&&box.height>=44&&box.width>=44,"mobile tabs must have 44px touch targets");
      }
      await bottomNav.locator('button[aria-haspopup="dialog"]').click();
      const sheet=page.locator('[data-more-sheet]');
      assert.equal(await sheet.count(),1,"More sheet should open");
      assert.deepEqual(await sheet.locator('a').allTextContents(),["About","Methodology","FAQ","Privacy"]);
      assert.equal(await sheet.getByRole('group',{name:"Appearance"}).count(),1);
      await page.keyboard.press("Escape");
      assert.equal(await sheet.count(),0,"Escape should close More sheet");
    }else{
      assert.equal(await bottomNav.isVisible(),false,"mobile tabs must be hidden on desktop");
      assert.equal(await page.locator('[data-header-nav="true"]').count(),1,"desktop header navigation missing");
    }
    const prelaunch=page.locator('[data-prelaunch-fixture="true"] [data-home-phase="pre-first-published-round"]');
    assert.equal(await prelaunch.count(),1,"prelaunch banner should exist in real components");
    const prelaunchSection=prelaunch.locator("section.market-hero");
    assert.equal(await prelaunchSection.count(),1,"one pre-first-round banner only");
    assert.equal(await prelaunchSection.locator("time[datetime='2026-11-23']").count(),1,"actual start date shown once");
    const prelaunchText=await prelaunch.innerText();
    assert.equal((prelaunchText.match(/2026-11-23/g)||[]).length,1,"start date must not be repeated");
    assert.ok(prelaunchText.includes("market data for 1 US stocks"),"actual universe size from dataset, not an invented number");
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
    for(const emptyTitle of ["AI investment leaderboard","Cumulative return chart","Latest session trades","Top conflicts","Decision follow-ups","Experiment journal","Recent AI decisions & rationale"]){
      assert.ok(!prelaunchText.includes(emptyTitle),"empty live section must be omitted: "+emptyTitle);
    }
    const status=page.locator('[data-home-data-status="true"]:visible');
    assert.equal(await status.count(),1,"exactly one visible as-of status at "+width);
    assert.match(await status.innerText(),/Awaiting first round/,"missing pre-first-round state");
    assert.doesNotMatch(await status.innerText(),/—/,"empty as-of date must not use dash");
    const logos=page.locator('a[aria-label="LogicSight home"]:visible');
    assert.equal(await logos.count(),width<1024?1:1);
    const text=await logos.first().textContent();
    assert.ok(text.includes("LogicSight"),"current brand must be visible");
    const headline=await page.locator("h1.hero-title").textContent();
    assert.equal(headline.replace(/\s+/g," ").trim(),"One market. Four AI perspectives.",
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

    assert.equal(await page.locator('label[aria-label="Display language"]').count(),0,
      "Language selector must be absent");
    const statusBox=rect(await status.boundingBox());
    if(width<640){
      const logoBox=rect(await logos.first().boundingBox());
      assert.ok(statusBox.top>=logoBox.bottom-1,"mobile data date must use a separate row");
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=1,"horizontal scrolling at "+width+"px: "+overflow);
    console.log("PASS responsive home UI",width+"px",": English-only header, 5 spaced colored legend chips, conditional holder dots, no overflow");
    await context.close();
  }
}finally{
  await browser?.close();
  server.kill("SIGTERM");
  await delay(300);
  if(server.exitCode===null)server.kill("SIGKILL");
}
