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
 const viewport=useRef<HTMLDivElement>(null);
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
   isTransparent:false,displayMode:"compact",
   width:window.matchMedia("(max-width: 767px)").matches?1200:"100%",
   height:84,locale:"en"
  });
  node.appendChild(script);
  return()=>node.replaceChildren();
 },[]);
 useEffect(()=>{
  const el=viewport.current;
  if(!el)return;
  // Start on SPY, then move through the quote strip. No reliance on
  // TradingView's marquee initial offset. Respect reduced-motion preferences.
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  if(reduced.matches)return;
  let frame=0;
  let last=0;
  let progress=0;
  let pauseUntil=performance.now()+1600;
  let manualUntil=0;
  const speed=19; // CSS pixels per second, slow enough to read prices.
  const scale=()=>window.matchMedia("(max-width: 767px)").matches ? 0.75 : 1;
  const tick=(now:number)=>{
   const step=last?Math.min((now-last)/1000,.1):0;
   last=now;
   const inner=host.current;
   const factor=scale();
   const max=inner?Math.max(0,(inner.offsetWidth*factor-el.clientWidth)/factor):0;
   if(now>=pauseUntil&&now>=manualUntil&&max>0){
    progress+=speed*step/factor;
    if(progress>=max){
     progress=0;
     pauseUntil=now+1350;
    }
    el.scrollLeft=progress;
   }
   frame=requestAnimationFrame(tick);
  };
  const onUser=()=>{
   progress=el.scrollLeft;
   manualUntil=performance.now()+4500;
  };
  const reset=()=>{progress=0;el.scrollLeft=0;pauseUntil=performance.now()+1000;last=0};
  const onVisibility=()=>{if(!document.hidden){last=0;manualUntil=performance.now()+1200}};
  el.addEventListener("touchstart",onUser,{passive:true});
  el.addEventListener("pointerdown",onUser,{passive:true});
  el.addEventListener("wheel",onUser,{passive:true});
  window.addEventListener("resize",reset);
  document.addEventListener("visibilitychange",onVisibility);
  frame=requestAnimationFrame(tick);
  return()=>{
   cancelAnimationFrame(frame);
   el.removeEventListener("touchstart",onUser);
   el.removeEventListener("pointerdown",onUser);
   el.removeEventListener("wheel",onUser);
   window.removeEventListener("resize",reset);
   document.removeEventListener("visibilitychange",onVisibility);
  };
 },[]);
 return <section aria-label="Market ETF prices supplied by TradingView" data-market-ticker
  className="ticker-outer h-[63px] w-full overflow-hidden border-y border-line bg-[#121d32] md:h-[84px]">
   <div ref={viewport} className="ticker-static-scroll" data-ticker-start="left" data-ticker-auto-scroll="true">
    <div ref={host} className="tradingview-widget-container ticker-static-inner"/>
   </div>
 </section>;
}
