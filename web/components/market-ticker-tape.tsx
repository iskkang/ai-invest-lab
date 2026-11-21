"use client";
import {useEffect,useRef} from "react";

const symbols=[
 {proName:"AMEX:SPY",title:"SPY"},
 {proName:"NASDAQ:QQQ",title:"QQQ"},
 {proName:"AMEX:DIA",title:"DIA"},
 {proName:"AMEX:IWM",title:"IWM"},
 {proName:"CAPITALCOM:VIX",title:"VIX (CFD)"}
];

export function MarketTickerTape(){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=host.current;
  if(!node)return;
  // Remove stale TradingView scripts and iframes before mounting a fresh widget.
  node.replaceChildren();
  const widget=document.createElement("div");
  widget.className="tradingview-widget-container__widget";
  node.appendChild(widget);
  const script=document.createElement("script");
  script.src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  script.async=true;
  script.textContent=JSON.stringify({
   symbols,
   showSymbolLogo:false,
   colorTheme:"dark",
   isTransparent:false,
   width:"100%",
   displayMode:"compact",
   locale:"en"
  });
  node.appendChild(script);
  return()=>{node.replaceChildren()};
 },[]);
 return <section aria-label="Market ETF prices supplied by TradingView" data-market-ticker
  className="ticker-outer h-[52px] w-full overflow-hidden border-y border-line bg-[#101d32]">
  <div ref={host} className="tradingview-widget-container ticker-inner"/>
 </section>;
}
