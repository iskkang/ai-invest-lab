"use client";
import {useEffect,useRef} from "react";
const symbols=[
 {proName:"AMEX:SPY",title:"SPY (S&P 500)"},
 {proName:"NASDAQ:QQQ",title:"QQQ (Nasdaq 100)"},
 {proName:"AMEX:DIA",title:"DIA (Dow)"},
 {proName:"AMEX:IWM",title:"IWM (Russell 2000)"},
 {proName:"CAPITALCOM:VIX",title:"VIX (CFD)"}
];
export function MarketTickerTape(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  let previous="";
  const render=()=>{
   const theme=document.documentElement.classList.contains("dark")?"dark":"light";
   if(previous===theme)return;
   previous=theme;
   node.replaceChildren();
   const host=document.createElement("div");
   host.className="tradingview-widget-container__widget";
   node.appendChild(host);
   const script=document.createElement("script");
   script.src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
   script.async=true;
   script.textContent=JSON.stringify({symbols,showSymbolLogo:false,isTransparent:true,displayMode:"adaptive",colorTheme:theme,locale:"en"});
   node.appendChild(script);
  };
  render();
  const observer=new MutationObserver(render);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
  return()=>{observer.disconnect();node.replaceChildren()};
 },[]);
 return <section aria-label="Market ETFs supplied by TradingView" data-market-ticker className="h-[52px] w-full overflow-hidden border-y border-line bg-panel"><div ref={ref} className="tradingview-widget-container h-[52px] w-full"/></section>;
}
