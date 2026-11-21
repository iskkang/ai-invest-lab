import assert from "node:assert/strict";
import test from "node:test";
import { isNavActive } from "../lib/nav-active.ts";

test("locale dashboard is only active at the exact language homepage", () => {
  for (const locale of ["ko", "en", "zh", "ja"]) {
    assert.equal(isNavActive("/" + locale, "/" + locale), true);
    for (const section of ["weekly", "consensus", "accuracy", "portfolio", "performance", "trades"]) {
      assert.equal(isNavActive("/" + locale + "/" + section, "/" + locale), false);
    }
  }
});

test("weekly index is active for its detail URLs but not other pages", () => {
  assert.equal(isNavActive("/en/weekly", "/en/weekly"), true);
  assert.equal(isNavActive("/en/weekly/2026-W48", "/en/weekly"), true);
  assert.equal(isNavActive("/en/weekly/", "/en/weekly"), true);
  assert.equal(isNavActive("/en/weekly-stats", "/en/weekly"), false);
  assert.equal(isNavActive("/ja/weekly", "/en/weekly"), false);
  assert.equal(isNavActive("/en/consensus", "/en/weekly"), false);
  assert.equal(isNavActive("/en/accuracy", "/en/accuracy"), true);
});
