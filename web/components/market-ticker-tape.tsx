"use client";
import {useEffect,useRef} from "react";
export function MarketTickerTape(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  node.replaceChildren();
  const host=document.createElement("div");host.className="tradingview-widget-container__widget";node.appendChild(host);
  const script=document.createElement("script");script.src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";script.async=true;
  script.textContent=JSON.stringify({symbols:[
   {proName:"TVC:SPX",title:"S&P 500"},
   {proName:"NASDAQ:NDX",title:"Nasdaq 100"},
   {proName:"DJ:DJI",title:"Dow Jones"},
   {proName:"TVC:RUT",title:"Russell 2000"},
   {proName:"CBOE:VIX",title:"VIX"}
  ],showSymbolLogo:false,isTransparent:false,displayMode:"adaptive",colorTheme:"light",locale:"en"});
  node.appendChild(script);
  return()=>{node.replaceChildren()};
 },[]);
 return <section aria-label="Market indices supplied by TradingView" data-market-ticker className="h-[52px] w-full overflow-hidden border-b border-line bg-white"><div ref={ref} className="tradingview-widget-container h-[52px] w-full"/></section>;
}
