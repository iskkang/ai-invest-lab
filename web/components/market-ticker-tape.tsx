"use client";
import {useEffect,useRef,useState} from "react";
type ResolvedTheme="dark"|"light";
const symbols=[
 {proName:"AMEX:SPY",title:"SPY"},
 {proName:"NASDAQ:QQQ",title:"QQQ"},
 {proName:"AMEX:DIA",title:"DIA"},
 {proName:"AMEX:IWM",title:"IWM"},
 {proName:"CAPITALCOM:VIX",title:"VIX (CFD)"}
];
function resolvedTheme():ResolvedTheme{
 const preference=document.documentElement.dataset.themePreference;
 if(preference==="dark")return "dark";
 if(preference==="light")return "light";
 if(preference==="system"){
  return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
 }
 return document.documentElement.classList.contains("dark")?"dark":"light";
}
function TradingViewEmbed({theme}:{theme:ResolvedTheme}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=host.current;
  if(!node)return;
  const script=document.createElement("script");
  script.src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  script.async=true;
  script.textContent=JSON.stringify({
   symbols,showSymbolLogo:false,isTransparent:true,
   displayMode:"regular",colorTheme:theme,locale:"en"
  });
  node.appendChild(script);
  return()=>{node.replaceChildren()};
 },[theme]);
 return <div ref={host} className="tradingview-widget-container ticker-inner">
  <div className="tradingview-widget-container__widget"/>
 </div>;
}
export function MarketTickerTape(){
 const [theme,setTheme]=useState<ResolvedTheme|null>(null);
 useEffect(()=>{
  const update=()=>setTheme(resolvedTheme());
  update();
  const observer=new MutationObserver(update);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-theme-preference"]});
  const media=window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener?.("change",update);
  window.addEventListener("logicsight-theme-change",update);
  return()=>{
   observer.disconnect();media.removeEventListener?.("change",update);
   window.removeEventListener("logicsight-theme-change",update);
  };
 },[]);
 return <section aria-label="Market ETF prices supplied by TradingView" data-market-ticker
  className="ticker-outer h-[46px] w-full overflow-hidden border-y border-line bg-panel sm:h-[52px]">
  {theme!==null?<TradingViewEmbed key={theme} theme={theme}/>:null}
 </section>;
}
