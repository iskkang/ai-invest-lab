"use client";
import {useEffect,useState} from "react";
const symbols=[
 {proName:"AMEX:SPY",title:"SPY (S&P 500)"},
 {proName:"NASDAQ:QQQ",title:"QQQ (Nasdaq 100)"},
 {proName:"AMEX:DIA",title:"DIA (Dow)"},
 {proName:"AMEX:IWM",title:"IWM (Russell 2000)"},
 {proName:"CAPITALCOM:VIX",title:"VIX (CFD)"}
];
function TradingViewEmbed({theme}:{theme:"light"|"dark"}){
 useEffect(()=>{
  const container=document.getElementById("tv-ticker-"+theme);
  if(!container)return;
  const script=document.createElement("script");
  script.src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  script.async=true;
  script.textContent=JSON.stringify({symbols,showSymbolLogo:false,isTransparent:true,displayMode:"regular",colorTheme:theme,locale:"en"});
  container.appendChild(script);
  return()=>{script.remove()};
 },[theme]);
 return <div id={"tv-ticker-"+theme} className="tradingview-widget-container h-[52px] w-full"><div className="tradingview-widget-container__widget"/></div>;
}
export function MarketTickerTape(){
 const [theme,setTheme]=useState<"light"|"dark"|null>(null);
 useEffect(()=>{
  const update=()=>setTheme(document.documentElement.classList.contains("dark")?"dark":"light");
  update();
  const observer=new MutationObserver(update);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
  window.addEventListener("logicsight-theme-change",update);
  return()=>{observer.disconnect();window.removeEventListener("logicsight-theme-change",update)};
 },[]);
 return <section aria-label="Market ETFs supplied by TradingView" data-market-ticker className="h-[52px] w-full overflow-hidden border-y border-line bg-panel">
 {theme&&<TradingViewEmbed key={theme} theme={theme}/>}
 </section>;
}
