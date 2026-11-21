import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { experimentIntroText } from "../lib/experiment-intro.ts";
import { sectionLabel, SECTION_LABELS } from "../lib/section-labels.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeSources = [
  "lib/i18n.ts", "lib/public-content.ts", "lib/retention-copy.ts",
  "lib/returning-copy.ts", "lib/insight-copy.ts", "lib/methodology-copy.ts",
  "lib/historical-copy.ts", "lib/pattern-copy.ts", "lib/section-labels.ts",
  "components/dashboard-hero.tsx",
];
const langs = ["ko","en","zh","ja"];
const permittedExactKoreanValues = new Set([
  "AI",                                    // widely used Korean acronym
  "GPT · Claude · Gemini · DeepSeek",     // exact product names (not prose)
]);
function keyName(prop) {
  return ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
    ? prop.name.text : null;
}
function propMap(obj) {
  return new Map(obj.properties
    .filter(p => ts.isPropertyAssignment(p) && keyName(p))
    .map(p => [keyName(p), p.initializer]));
}
function leaves(node, route = "") {
  const out = new Map();
  if (ts.isStringLiteralLike(node)) {
    out.set(route, node.text);
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const [key, value] of propMap(node)) {
      for (const [sub, str] of leaves(value, route ? route+"."+key : key)) out.set(sub, str);
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((el, index) => {
      for (const [sub, str] of leaves(el, route+"["+index+"]")) out.set(sub, str);
    });
  }
  return out;
}
function dictionaries(source) {
  const found = [];
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const map = propMap(node);
      if (langs.every(l => map.has(l)) &&
          langs.every(l => ts.isObjectLiteralExpression(map.get(l)) || ts.isStringLiteralLike(map.get(l)))) {
        found.push(Object.fromEntries(langs.map(l => [l, leaves(map.get(l))])));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

test("four-locale copy dictionaries have no blank or missing keys", () => {
  const omissions=[],englishKo=[],details=[];
  let audited=0;
  for (const relative of localeSources) {
    const filename=path.join(root,relative);
    const text=fs.readFileSync(filename,"utf8");
    const ast=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,
      filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(ast.parseDiagnostics.length,0,relative+" must parse");
    const sets=dictionaries(ast);
    if (relative!=="lib/i18n.ts")assert.ok(sets.length,relative+" must contain localizable copy");
    for (const dict of sets) {
      audited++;
      const keys = new Set(dict.ko.keys());
      for (const lang of langs) {
        const other = new Set(dict[lang].keys());
        for (const key of keys) if (!other.has(key)) omissions.push(relative+":"+lang+":"+key+" missing");
        for (const key of other) if (!keys.has(key)) omissions.push(relative+":"+lang+":"+key+" extra");
        for (const [key, val] of dict[lang]) {
          if (!val.trim()) omissions.push(relative+":"+lang+":"+key+" empty");
          if (lang==="ko" && /[A-Za-z]/.test(val) && !/[가-힣]/.test(val) &&
              !permittedExactKoreanValues.has(val)) {
            englishKo.push(relative+":"+key+" = "+val);
          }
        }
      }
    }
    details.push(relative+": "+sets.length+" localized dictionaries");
  }
  assert.ok(audited>=15,"locale dictionaries must be discovered");
  assert.deepEqual(omissions,[],"missing/blank localized copy: \n"+omissions.join("\n"));
  assert.deepEqual(englishKo,[],"Korean English-only UI copy: \n"+englishKo.join("\n"));
  console.log("PASS "+audited+" locale dictionaries; no missing or blank ko/zh/ja keys");
});

test("i18n translation rows are complete, unique, and contain Korean labels", () => {
  const filename=path.join(root,"lib/i18n.ts");
  const ast=ts.createSourceFile(filename,fs.readFileSync(filename,"utf8"),
    ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const variable=ast.statements.flatMap(statement =>
    ts.isVariableStatement(statement)?statement.declarationList.declarations:[])
    .find(node=>node.name.getText(ast)==="rows");
  assert.ok(variable&&ts.isArrayLiteralExpression(variable.initializer),"missing i18n row map");
  const seen=new Set(),duplicates=[],blanks=[],englishKo=[];
  for (const [idx,row] of variable.initializer.elements.entries()){
    assert.ok(ts.isArrayLiteralExpression(row)&&row.elements.length===4,
      "i18n row "+idx+" must contain exactly 4 languages");
    const vals=row.elements.map(x=>ts.isStringLiteralLike(x)?x.text:null);
    assert.ok(vals.every(x=>x!==null),"dynamic translation in i18n row "+idx);
    vals.forEach((value,i)=>{
      if(!value.trim())blanks.push(idx+":"+langs[i]);
    });
    if(seen.has(vals[0]))duplicates.push(vals[0]);
    seen.add(vals[0]);
    if(!/[가-힣]/.test(vals[0])&&/[A-Za-z]/.test(vals[0]) &&
        !permittedExactKoreanValues.has(vals[0]))englishKo.push(vals[0]);
  }
  assert.deepEqual(duplicates,[],"duplicate translation keys");
  assert.deepEqual(blanks,[],"blank translation values");
  assert.deepEqual(englishKo,[],"English-only ko lookup keys");
  console.log("PASS "+seen.size+" complete i18n rows; zh/ja blank keys: 0");
});

test("all reusable section labels have Korean wording and nonempty other locales",()=>{
  for(const [key,labels] of Object.entries(SECTION_LABELS)){
    for(const locale of langs){
      assert.ok(sectionLabel(locale,key).trim(),"blank section label "+key+":"+locale);
    }
    assert.ok(/[가-힣]/.test(labels.ko),"untranslated Korean section label: "+key);
  }
});

test("initial-cash amount takes Korean particle without an extra space",()=>{
  const actual=experimentIntroText("ko",100000,"2026-11-23");
  assert.match(actual,/\$100,000로 시작합니다/);
  assert.doesNotMatch(actual,/\$100,000\s+로/);
  for(const locale of langs)assert.ok(experimentIntroText(locale,100000,"2026-11-23").includes("$100,000"));
});

test("hardcoded English editorial labels cannot reappear in JSX components",()=>{
  const paths=[
    "components/shell.tsx","components/dashboard-hero.tsx","components/dashboard-view.tsx",
    "components/insight-panels.tsx","components/retention-panels.tsx",
    "components/historical-dashboard.tsx","components/pattern-dashboard.tsx",
  ];
  const editorial=[
    "RESEARCH DESK / 01","DIFFERENCE ENGINE","DECISIONS / FOLLOW-UP",
    "INTELLIGENCE / EXPLORE","RESEARCH TERMINAL","PERFORMANCE / SEASON 01",
    "DAILY / AI INVEST LAB","RESEARCH / SCHEDULE","HISTORICAL / RESEARCH",
    "PATTERN LAB / RESEARCH","PORTFOLIO / ALL WEATHER","PATTERN / OBSERVATIONS",
  ];
  for(const filename of paths){
    const src=fs.readFileSync(path.join(root,filename),"utf8");
    for(const term of editorial)assert.ok(!src.includes(term),
      "Hardcoded untranslated editorial label "+term+" in "+filename);
  }
});
