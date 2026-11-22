"use client";
import {useEffect,useRef} from "react";

// Static TradingView Tickers: unlike Ticker Tape, always begins with the first symbol
// at the physical left edge; subsequent symbols remain available by horizontal swipe.
const SYMBOLS="AMEX:SPY,NASDAQ:QQQ,AMEX:DIA,AMEX:IWM,CAPITALCOM:VIX";
const WIDGET_SCRIPT="https://widgets.tradingview-widget.com/w/en/tv-tickers.js";

export function MarketTickerTape(){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=host.current;
  if(!node)return;
  node.replaceChildren();
  node.scrollLeft=0;
  const ticker=document.createElement("tv-tickers");
  ticker.setAttribute("symbols",SYMBOLS);
  ticker.setAttribute("direction","horizontal");
  ticker.setAttribute("theme","dark");
  ticker.setAttribute("item-size","compact");
  ticker.setAttribute("hide-chart","");
  ticker.setAttribute("aria-label","SPY, QQQ, DIA, IWM, VIX market prices from TradingView");
  node.appendChild(ticker);

  // TradingView supplies and updates all prices. No licensed broker quotes are republished.
  const script=document.createElement("script");
  script.type="module";
  script.src=WIDGET_SCRIPT;
  script.async=true;
  node.appendChild(script);
  return()=>{node.replaceChildren()};
 },[]);
 return <section aria-label="Market ETF prices supplied by TradingView" data-market-ticker
  className="ticker-outer h-[63px] w-full overflow-hidden border-y border-line bg-[#121d32] md:h-[84px]">
  <div ref={host} className="ticker-static-list" data-ticker-start="left"/>
 </section>;
}
