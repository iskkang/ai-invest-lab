"use client";
import {useEffect,useRef} from "react";

const symbols=[
 {proName:"AMEX:SPY",title:"SPY"},
 {proName:"NASDAQ:QQQ",title:"QQQ"},
 {proName:"AMEX:DIA",title:"DIA"},
 {proName:"AMEX:IWM",title:"IWM"},
 {proName:"CAPITALCOM:VIX",title:"VIX (CFD)"}
];

/** TradingView's static (non-marquee) Tickers widget.
 * A wide internal viewport allows a 375px phone to show the first ~2.5 quotes,
 * starting with SPY on the far left; the remaining items are reachable by swipe.
 */
export function MarketTickerTape(){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=host.current;
  if(!node)return;
  node.replaceChildren();
  const widget=document.createElement("div");
  widget.className="tradingview-widget-container__widget";
  node.appendChild(widget);
  const script=document.createElement("script");
  script.src="https://s3.tradingview.com/external-embedding/embed-widget-tickers.js";
  script.async=true;
  script.textContent=JSON.stringify({
   symbols,showSymbolLogo:false,colorTheme:"dark",
   isTransparent:false,width:"100%",height:84,locale:"en"
  });
  node.appendChild(script);
  return()=>node.replaceChildren();
 },[]);
 return <section aria-label="Market ETF prices supplied by TradingView" data-market-ticker
  className="ticker-outer h-[63px] w-full overflow-hidden border-y border-line bg-[#121d32] md:h-[84px]">
   <div className="ticker-static-scroll" data-ticker-start="left">
    <div ref={host} className="tradingview-widget-container ticker-static-inner"/>
   </div>
 </section>;
}
