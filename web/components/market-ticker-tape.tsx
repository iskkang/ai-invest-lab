"use client";

import Script from "next/script";
import {createElement} from "react";

const symbols = "AMEX:SPY,NASDAQ:QQQ,AMEX:DIA,AMEX:IWM,CAPITALCOM:VIX";

export function MarketTickerTape() {
  return <section data-market-ticker aria-label="Market prices supplied by TradingView" className="market-tape">
    <Script type="module" src="https://widgets.tradingview-widget.com/w/en/tv-ticker-tape.js" />
    <div className="market-tape-track">
      {[false, true].map(copy => (
        <div key={String(copy)} className="market-tape-group" aria-hidden={copy || undefined} inert={copy || undefined}>
          {createElement("tv-ticker-tape", {
            symbols, transparent: "", "disable-scroll": "", "hide-chart": "", "hide-logo": "",
            "symbol-titles": JSON.stringify({"CAPITALCOM:VIX":"VIX (CFD)"})
          })}
        </div>
      ))}
    </div>
  </section>;
}
