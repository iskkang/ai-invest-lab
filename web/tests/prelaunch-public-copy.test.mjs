import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const root=path.resolve(web,"..");
const excluded=new Set([".git",".next","node_modules",".vercel","coverage"]);
const retiredBrand=new RegExp("market"+"sights","i");
function sourceFiles(dir){
 const found=[];
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(excluded.has(item.name))continue;
  const full=path.join(dir,item.name);
  if(item.isDirectory())found.push(...sourceFiles(full));
  else if(/\.(?:tsx?|mjs|jsx?|py|md|css|svg|json|ya?ml|sql|toml|txt)$/.test(item.name))found.push(full);
 }
 return found;
}
test("retired branding and duplicate market-data wording are absent across the repository",()=>{
 const violations=[];
 for(const file of sourceFiles(root)){
  if(file.endsWith("package-lock.json"))continue;
  const body=fs.readFileSync(file,"utf8");
  if(retiredBrand.test(body))violations.push(path.relative(root,file)+": retired brand");
  if(body.includes(["licensed raw","licensed market-data provider"].join(" ")))
   violations.push(path.relative(root,file)+": duplicated provider wording");
 }
 assert.deepEqual(violations,[]);
});
test("pattern hit rates are unsigned and source attribution is shared",()=>{
 const card=fs.readFileSync(path.join(web,"components/pattern-dashboard.tsx"),"utf8");
 const copy=fs.readFileSync(path.join(web,"lib/pattern-copy.ts"),"utf8");
 const about=fs.readFileSync(path.join(web,"app/about/page.tsx"),"utf8");
 const attribution=fs.readFileSync(path.join(web,"lib/market-data-disclosure.ts"),"utf8");
 assert.doesNotMatch(card,/signed\(row\.hitRate\)/);
 assert.match(card,/hitRateText\(row\.hitRate,locale\)/);
 assert.match(card,/row\.up.*row\.observations/);
 assert.match(copy,/Historical observations \(not controlled\)/);
 assert.match(attribution,/NH Investment & Securities NH PLUG API \(price data; raw prices are not republished\)/);
 assert.match(card,/MARKET_DATA_ATTRIBUTION/);
 assert.match(about,/MARKET_DATA_ATTRIBUTION/);
});
test("desktop parent menus remain destinations while submenu toggles stay separate",()=>{
 const nav=fs.readFileSync(path.join(web,"components/nav.tsx"),"utf8");
 const groups=fs.readFileSync(path.join(web,"lib/nav-groups.ts"),"utf8");
 assert.match(nav,/href=\{localizedHref\(locale,group\.href\)\}/);
 assert.match(nav,/data-nav-trigger=\{group\.id\}/);
 for(const [id,href] of [["compare","/consensus"],["research","/patterns"],["journal","/journal"]]){
  assert.match(groups,new RegExp('id:"'+id+'",href:"'+href+'"'));
 }
});
