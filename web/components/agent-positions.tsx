import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Account, Dataset, Trade } from "@/lib/types";
import { positionHistory } from "@/lib/position-history";
import { fmtPct, fmtUsd, toneClass } from "@/lib/utils";
import { ModelMark } from "./model-mark";
import styles from "./agent-positions.module.css";

export function AgentPositions({d, account, trades}: {d:Dataset; account:Account; trades:Trade[]}) {
  const {latest, rows} = positionHistory(d.snapshots.filter(s => s.accountId === account.id), trades);
  const pending = d.pendingOrders?.filter(o => o.accountId === account.id) ?? [];
  const unvalued = trades.filter(t => !latest || t.tradeDate > latest.date);
  const names = new Map(d.universe.map(s => [s.symbol,s.name]));
  return <div className={styles.report}>
    <Link className={styles.back} href="/en/portfolio"><ArrowLeft size={15}/> All portfolios</Link>
    <header className={styles.header}>
      <div className={styles.identity}><span className={styles.logo} style={{color:account.color}}>
        <ModelMark id={account.aiId ?? ""} size={42}/></span>
        <div><h1>{account.name}</h1><p>{account.model}</p></div></div>
      <div className={styles.result}><span>Portfolio return</span><strong className={toneClass(latest?.cumReturn)}>{fmtPct(latest?.cumReturn)}</strong>
        <small>{latest ? "US close · " + latest.date : "Awaiting valuation"}</small></div>
    </header>
    <section className={styles.section} aria-labelledby="positions-heading">
      <div className={styles.title}><h2 id="positions-heading">Positions &amp; sales</h2>
        {latest && <span>USD · As of {latest.date}</span>}</div>
      <table className={styles.table}><thead><tr>
          {["Stock","Shares","Invested","P&L","Return","First buy","Sold on","Status"].map(h =>
            <th key={h} scope="col">{h}</th>)}
        </tr></thead><tbody>{rows.map(r => {
          const gain = r.cost !== null && r.cost > 0 && r.pnl !== null ? r.pnl / r.cost : null;
          const status = !r.sold ? "Holding" : r.pnl !== null && r.pnl < 0 ? "Sold at a loss" : "Sold";
          return <tr key={r.key}><th scope="row"><Link href={"/en/stocks/" + r.symbol}>{r.symbol}</Link>
            <small>{names.get(r.symbol)}</small>{r.carried && <small>Prior close used</small>}</th>
            <td data-label="Shares">{r.quantity.toLocaleString("en-US")}</td>
            <td data-label="Invested">{r.cost === null ? "—" : fmtUsd(r.cost,2)}</td>
            <td data-label="P&L" className={toneClass(r.pnl)}>{r.pnl === null ? "—" : fmtUsd(r.pnl,2)}</td>
            <td data-label="Return" className={toneClass(gain)}><b>{fmtPct(gain)}</b></td>
            <td data-label="First buy">{r.bought ?? "—"}</td><td data-label="Sold on">{r.sold ?? "—"}</td>
            <td data-label="Status"><span className={styles.badge} data-state={status}>{status}</span></td></tr>;
        })}</tbody></table>
      {rows.length ?
        <p className={styles.note}>Open returns use the latest valuation and average purchase cost, including buy fees. Each sale shows its own realized return after fees. First buy is the start of the holding period.</p>
       : <p className={styles.empty}>{latest ? "No holdings or completed sales at this close." : "Awaiting the first portfolio valuation."}</p>}
    </section>
    {unvalued.length > 0 && <section className={styles.section}><div className={styles.title}><h2>Filled since the last valuation</h2></div>
      <ul className={styles.orders}>{unvalued.map(t => <li key={t.id}><b>{t.symbol}</b> · {t.side} {t.quantity} shares · {t.tradeDate}</li>)}</ul></section>}
    {pending.length > 0 && <section className={styles.section}><div className={styles.title}><h2>Awaiting fill</h2><span>{pending.length} pending orders</span></div>
      <ul className={styles.orders}>{pending.map(o => <li key={o.id}><b>{o.symbol}</b> · {o.side} {o.quantity} shares · {o.date}</li>)}</ul></section>}
  </div>;
}
