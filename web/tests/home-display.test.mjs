import assert from "node:assert/strict";
import test from "node:test";
import {dataAsOfLabel,hasHolderDots} from "../lib/home-display.ts";

test("empty data as-of uses a localized pre-first-round state, never a dash",()=>{
  assert.deepEqual(["ko","en","zh","ja"].map(locale=>dataAsOfLabel("",locale)),
    ["첫 회차 전","Before first round","首轮开始前","初回ラウンド前"]);
  assert.equal(dataAsOfLabel("2026-11-20","ko"),"2026-11-20");
  assert.equal(dataAsOfLabel("  ","en"),"Before first round");
});

test("AI holder-dot explanation is strictly conditional on visible dots",()=>{
  assert.equal(hasHolderDots([]),false);
  assert.equal(hasHolderDots([{holders:[]},{holders:[]}]),false);
  assert.equal(hasHolderDots([{holders:[]},{holders:[{id:1}]}]),true);
});
