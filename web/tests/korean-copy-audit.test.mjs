import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

/** Regression guard for the four independently authored locale dictionaries.
 * Does not translate AI-generated reasoning and never invents missing copy.
 */
const path = new URL("../",import.meta.url);
const from = relative => fs.readFileSync(new URL(relative,path),"utf8");
const files = [
  "lib/public-content.ts","lib/retention-copy.ts","lib/returning-copy.ts",
  "lib/insight-copy.ts","lib/methodology-copy.ts","lib/historical-copy.ts",
  "lib/pattern-copy.ts","components/dashboard-hero.tsx","lib/section-labels.ts",
];

function localeBlock(code,locale){
  const match = new RegExp("(?:^|\\n)\\s*"+locale+"\\s*:\\s*\\{").exec(code);
  assert.ok(match,"locale "+locale+" missing");
  const start=code.indexOf("{",match.index);
  let depth=0,quote=null,escaped=false;
  for(let i=start;i<code.length;i++){
    const ch=code[i];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==="\\"){escaped=true;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"||ch==="`"){quote=ch;continue;}
    if(ch==="{")depth++;
    if(ch==="}" && --depth===0)return code.slice(start,i+1);
  }
  throw Error("unterminated "+locale+" block");
}
function valueProperties(block){
  return [...block.matchAll(/(?:^|[,\\n{])\\s*([a-zA-Z][\\w]*)\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"/g)]
    .map(m=>({key:m[1],value:m[2]}));
}
test("all 4-language i18n tuples are present and nonempty",()=>{
  const code=from("lib/i18n.ts");
  const rows=code.split("\n").filter(row=>row.trim().startsWith('["')).map(row=>JSON.parse(row.trim().replace(/,$/,"")));
  assert.ok(rows.length>=200);
  for(const [idx,row] of rows.entries()){
    assert.equal(row.length,4,"translation columns at line "+idx);
    for(const [locale,val] of row.entries())
      assert.ok(typeof val==="string"&&val.trim().length>0,"missing translation "+idx+" "+locale);
  }
  assert.equal(rows.filter(row=>/^[a-zA-Z .,()/-]+$/.test(row[0])&&row[0]!=="MDD").length,0,
    "the only intentionally English-only Korean key is the financial acronym MDD");
  assert.ok(rows.some(row=>row[0]==="샤프 지수"));
  assert.ok(!rows.some(row=>row[0]==="샤프"));
});
test("locale maps have no empty text values and the same key counts",()=>{
  for(const name of files){
    const code=from(name);
    const counts=[];
    for(const locale of ["ko","en","zh","ja"]){
      const values=valueProperties(localeBlock(code,locale));
      assert.ok(values.length>5,name+" "+locale+" has too few translated properties");
      assert.deepEqual(values.filter(p=>!p.value.trim()),[],
        name+" "+locale+" has empty translations");
      counts.push(values.length);
    }
    assert.ok(counts.every(n=>n===counts[0]),name+" missing keys in a locale: "+counts);
  }
});
test("decorative research headings follow all four locales; no remaining untranslated labels",()=>{
  const labels=from("lib/section-labels.ts");
  for(const key of [
    "researchDesk","differenceEngine","decisionFollowup","explore",
    "researchTerminal","schedule","marketResearch","decisionTracker",
  ])assert.match(labels,new RegExp(key+":"));
  const expected={
    "components/shell.tsx":["RESEARCH DESK / 01","RESEARCH TERMINAL","MARKET RESEARCH"],
    "components/retention-panels.tsx":["AI / DIFFERENCE ENGINE","DECISIONS / FOLLOW-UP","DAILY / AI INVEST LAB"],
    "components/insight-panels.tsx":["INTELLIGENCE / EXPLORE","RESEARCH / SCHEDULE"],
    "components/dashboard-view.tsx":["PERFORMANCE / SEASON 01"],
  };
  for(const [file,oldLabels] of Object.entries(expected)){
    const code=from(file);
    for(const old of oldLabels)assert.ok(!code.includes(">"+old+"<"),file+" retains "+old);
  }
  assert.match(from("components/dashboard-hero.tsx"),/\{c\.title1\}\{" "\}/);
});
test("Korean headlines and labels use natural spacing and explicit terms",()=>{
  const code=from("lib/home-display.ts");
  assert.match(code,/\$\{amount\}로 시작합니다/);
  const insight=from("lib/insight-copy.ts");
  assert.ok(!insight.includes('accuracy:"판단 정확도"'));
  assert.ok(insight.includes("매수·매도 판단을 최소 20건 검증한 뒤"));
  const next=from("lib/returning-copy.ts");
  assert.ok(!next.includes('followup:"다음 확인할 내용"'));
  assert.ok(next.includes("실험 진행 상황 확인"));
  const i18n=from("lib/i18n.ts");
  assert.ok(i18n.includes('"위험 조정(샤프 지수)"'));
});
