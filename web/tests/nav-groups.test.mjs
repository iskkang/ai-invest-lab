import assert from "node:assert/strict";
import test from "node:test";
import { NAV_GROUPS, activeNavGroup } from "../lib/nav-groups.ts";

const originalPaths=[
  "/","/daily","/journal","/consensus","/outcomes","/patterns",
  "/historical","/weekly","/accuracy","/performance","/portfolio","/trades","/about",
];
const groupNames=["dashboard","compare","research","journal","about"];
const expected={
  dashboard:["/"],compare:["/consensus","/performance","/portfolio","/trades"],
  research:["/patterns","/historical","/accuracy","/weekly"],
  journal:["/daily","/journal","/outcomes"],about:["/about"],
};

test("exactly five parent menus retain all 13 original destinations without redirects",()=>{
  assert.equal(NAV_GROUPS.length,5);
  assert.deepEqual(NAV_GROUPS.map(group=>group.id),groupNames);
  const all=NAV_GROUPS.flatMap(group=>group.children.length
    ?group.children.map(child=>child.href):[group.href]);
  assert.equal(all.length,13);
  assert.deepEqual([...all].sort(),[...originalPaths].sort());
  assert.equal(new Set(all).size,all.length,"URLs must not be duplicated");
  for(const group of NAV_GROUPS){
    const items=group.children.length?group.children.map(child=>child.href):[group.href];
    assert.deepEqual(items,expected[group.id]);
    for(const locale of ["ko","en","zh","ja"]){
      assert.ok(group.names[locale]?.trim(),"Missing parent translation "+group.id+" "+locale);
      for(const child of group.children){
        assert.ok(child.names[locale]?.trim(),"Missing child translation "+child.href+" "+locale);
      }
    }
  }
});
test("active parent highlights correctly on existing root and nested URLs in all languages",()=>{
  for(const locale of ["ko","en","zh","ja"]){
    assert.equal(activeNavGroup("/"+locale,locale),"dashboard");
    for(const group of NAV_GROUPS){
      const childPaths=group.children.length?group.children.map(x=>x.href):[group.href];
      for(const route of childPaths){
        const url="/"+locale+(route==="/ "?"":route==="/"
          ?"":route);
        assert.equal(activeNavGroup(url,locale),group.id,url);
        if(route!=="/")assert.equal(activeNavGroup(url+"/subpage",locale),group.id,url+"/subpage");
      }
    }
    assert.equal(activeNavGroup("/"+locale+"/ai/gpt",locale),"compare");
    assert.equal(activeNavGroup("/"+locale+"/stocks/AAPL",locale),"research");
    assert.equal(activeNavGroup("/"+locale+"/methodology",locale),"about");
    assert.equal(activeNavGroup("/"+locale+"/faq",locale),"about");
    assert.equal(activeNavGroup("/"+locale+"/privacy",locale),"about");
  }
  assert.equal(activeNavGroup("/en/weekly","ko"),null,
    "a locale mismatch must not select a misleading group");
});
