/** HTTP regression: four-language original dashboard + private API gate. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const root=new URL("../",import.meta.url).pathname;
const port=32284;
const base=`http://127.0.0.1:${port}`;
const server=spawn("node",["./node_modules/next/dist/bin/next","start","-p",String(port)],{
  cwd:root,
  env:{...process.env,DATA_MODE:"demo",SITE_ACCESS:"private",SITE_USER:"ci",SITE_PASSWORD:"integration-test"},
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
  await visible("/ko","AI 투자 리더보드");
  await visible("/en","AI investment leaderboard");
  await visible("/zh","AI 投资排行榜");
  await visible("/ja","AI投資ランキング");
  await visible("/en/portfolio","Portfolio");
  await visible("/zh/trades","交易记录");
  await visible("/ja/performance","パフォーマンス比較");
  await visible("/ko/about","AI는 실제로 주식투자를 잘할까?");
  await visible("/en/methodology","Comparable information");
  await visible("/ko/faq","실제 주식을 사거나");
  await visible("/zh/privacy","数据处理");
  await visible("/en/ai/gpt","GPT");
  await visible("/robots.txt","/sitemap.xml");
  await visible("/llms.txt","# AI Invest Lab");
  await visible("/ads.txt","No advertising sellers");
  const deploymentStatus = await req("/status");
  assert.equal(deploymentStatus.status,200,"public build probe unavailable");
  const probe = await deploymentStatus.json();
  assert.equal(probe.service,"AI Invest Lab");
  assert.equal(probe.component,"web");
  assert.equal(probe.dataMode,"demo");
  assert.equal(deploymentStatus.headers.get("cache-control"),"no-store");
  const map=await req("/sitemap.xml");
  assert.equal(map.status,200);
  const sitemap=await map.text();
  for(const locale of ["en","zh","ko","ja"]){
    for(const suffix of ["portfolio","trades","performance","ai/gpt"]){
      assert.ok(sitemap.includes(`/${locale}/${suffix}`),`sitemap missing ${locale}/${suffix}`);
    }
  }
  for(const path of ["/api/health/db","/portfolio","/trades","/performance","/ai/gpt","/stocks/AAPL","/en/advertise"]){
    const res=await req(path);
    assert.equal(res.status,401,`private path unexpectedly accessible: ${path}`);
    assert.match(res.headers.get("x-robots-tag")||"",/noindex/);
  }
  console.log("PASS: original multilingual public dashboard, SEO and private API paths.");
}finally{
  server.kill("SIGTERM");
  await sleep(500);
  if(server.exitCode===null)server.kill("SIGKILL");
}
