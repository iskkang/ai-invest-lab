"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import type { PortfolioRow } from "@/lib/portfolio-overview";
import { fmtPct, fmtUsd, toneClass } from "@/lib/utils";
import { ModelMark } from "./model-mark";
import styles from "./portfolio-board.module.css";

export function PortfolioBoard({ rows, decisionDate }: { rows: PortfolioRow[]; decisionDate: string | null }) {
  const [selected, setSelected] = useState<number | null>(null);
  const account = rows.find(row => row.id === selected) ?? rows[0];
  if (!account) return <section><h1>AI portfolios</h1><p>Awaiting portfolio records.</p></section>;
  const pending = decisionDate && (!account.date || decisionDate > account.date);

  return <section className={styles.board} aria-label="AI portfolio returns">
    <header className={styles.header}>
      <div><h1>AI portfolios</h1><p>Total return since inception, including cash and open positions.</p></div>
      <Link href="/en/consensus">Compare AI decisions <ArrowUpRight size={16}/></Link>
    </header>
    <div className={styles.cards} role="group" aria-label="Agent detail pages">
      {rows.map(row => <Link key={row.id} href={"/en/ai/" + row.aiId} className={styles.card}
        style={{ "--model": row.color } as CSSProperties}>
        <span className={styles.name}><ModelMark id={row.aiId ?? ""}/>{row.name}<ArrowUpRight size={16} aria-hidden/></span>
        <strong className={toneClass(row.gain)}>{fmtPct(row.gain)}</strong>
        <span className={styles.asof}>{row.date ? <>US close · <time dateTime={row.date}>{row.date}</time></> : "Awaiting valuation"}</span>
      </Link>)}
    </div>
    <div id="portfolio-holdings" className={styles.panel} aria-label={account.name + " open positions"}>
      <div className={styles.panelHead}>
        <div><h2><label>Holdings <select className={styles.selector} value={account.id} onChange={e => setSelected(Number(e.target.value))}>
          {rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></h2><p>{account.date ? "Valued at the " + account.date + " US close" : "Awaiting the first closing valuation"}</p></div>
        <dl className={styles.metrics}>
          <div><dt>Account value</dt><dd>{account.equity === null ? "—" : fmtUsd(account.equity,2)}</dd></div>
          <div><dt>Cash</dt><dd>{account.cash === null ? "—" : fmtUsd(account.cash,2)}</dd></div>
          <div><dt>Open positions return</dt><dd className={toneClass(account.openGain)}>{fmtPct(account.openGain)}</dd></div>
        </dl>
      </div>
      {pending && <p className={styles.notice}>The {decisionDate} decisions are published. Closing valuations for that session are pending.</p>}
      {account.positions.length ? <>
        <table className={styles.table}><thead><tr><th scope="col">Stock</th><th scope="col">Shares</th>
          <th scope="col">Value</th><th scope="col">Weight</th><th scope="col">Open P&amp;L</th><th scope="col">Return</th></tr></thead>
          <tbody>{account.positions.map(p => <tr key={p.symbol}>
            <th scope="row"><Link href={"/en/stocks/" + encodeURIComponent(p.symbol)}>{p.symbol}</Link>
              {p.name && p.name !== p.symbol && <small>{p.name}</small>}{p.carried && <small>Prior close used</small>}</th>
            <td>{p.quantity.toLocaleString("en-US")}</td><td>{fmtUsd(p.value,2)}</td><td>{fmtPct(p.weight,1,false)}</td>
            <td className={toneClass(p.pnl)}>{fmtUsd(p.pnl,2)}</td><td className={toneClass(p.gain)}><b>{fmtPct(p.gain)}</b></td>
          </tr>)}</tbody></table>
        <p className={styles.foot}>Position returns use the remaining purchase cost, including buy fees.</p>
      </> : <div className={styles.empty}><Wallet size={23} aria-hidden/><div><b>{account.date ? "No open positions at this close" : "Holdings pending"}</b>
        <p>Stocks appear here after simulated fills and a closing valuation.</p></div></div>}
    </div>
  </section>;
}
