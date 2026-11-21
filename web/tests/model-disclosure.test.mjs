import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { MODEL_TIER_EVIDENCE } from "../lib/model-tiers.ts";

const manifest=JSON.parse(fs.readFileSync(new URL("../lib/engine-methodology.generated.json",import.meta.url),"utf8"));
const expectedModels=[
  "openai/gpt-4.1-mini","anthropic/claude-sonnet-5.5",
  "google/gemini-3.8-flash","deepseek/deepseek-v3.2",
];
test("model IDs come from the Python engine snapshot; no model change",()=>{
  assert.deepEqual(manifest.models.map(model=>model.model),expectedModels);
  assert.deepEqual(manifest.models.map(model=>model.id),Object.keys(MODEL_TIER_EVIDENCE));
});
test("tiers require manufacturer sources, without guessing DeepSeek size",()=>{
  for(const [id,config] of Object.entries(MODEL_TIER_EVIDENCE)){
    assert.ok(/^https:\/\//.test(config.source),"missing official evidence URL "+id);
    for(const locale of ["ko","en","zh","ja"]){
      assert.equal(typeof config.tier[locale],"string");
      assert.ok(id==="deepseek"||config.tier[locale].trim(),
        "source-backed tier missing for "+id+" "+locale);
    }
  }
  assert.deepEqual(Object.values(MODEL_TIER_EVIDENCE.deepseek.tier),["","","",""]);
});
test("homepage and metadata do not overclaim identical conditions",()=>{
  const first=fs.readFileSync(new URL("../components/first-round-home.tsx",import.meta.url),"utf8");
  const descriptions=fs.readFileSync(new URL("../lib/public-content.ts",import.meta.url),"utf8");
  const root=fs.readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");
  assert.ok(first.includes("<ModelDisclosure locale={d.locale} dark/>"));
  assert.ok(descriptions.includes("모델의 규모와 가격대는 서로 다릅니다"));
  assert.ok(!root.includes("under identical conditions"));
  assert.ok(root.includes("virtual starting capital and trading rules"));
});
