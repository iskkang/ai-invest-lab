import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, Clock3, Fingerprint, Radio, TriangleAlert } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { inspectRound, MODEL_LABELS, type RoundState } from "@/lib/round-inspection";
import s from "./today-round.module.css";

const copy: Record<RoundState, [string, string]> = {
  closed: ["Market closed", "There is no scheduled NYSE round for this date."],
  scheduled: ["Awaiting the round", "The official decision window is 08:00–09:15 New York time."],
  running: ["Round in progress", "Execution evidence is present. This round is not yet verified."],
  missing: ["No round recorded", "A post-cutoff read found no official round. This alone does not establish why it is missing."],
  "price-error": ["Market-data check failed", "The run reported a price-data error. No complete official round has been verified."],
  failed: ["Run did not complete", "The engine recorded a failure or aborted this round."],
  unverified: ["Round not verified", "The available records do not establish four on-time decisions from one shared snapshot."],
  hold: ["All four models held", "Four valid decisions were recorded. No model proposed a simulated trade."],
  recorded: ["Four decisions recorded", "All four model decisions were saved by the cutoff using one shared snapshot."],
  unavailable: ["Results unavailable", "The results store could not be read. This does not establish that execution failed."],
};

export function TodayRound({ data, now, fixture = false }: { data: Dataset | null; now?: Date; fixture?: boolean }) {
  const r = inspectRound(data, now);
  const [title, description] = copy[r.state];
  const Signal = r.complete ? Check : r.state === "closed" || r.state === "scheduled" ? CalendarClock : r.state === "running" ? Radio : TriangleAlert;
  return <section className={s.panel} aria-labelledby="today-round-title">
    <header className={s.header}>
      <div className={s.eyebrow}><span>LOGICSIGHT / SESSION AUDIT</span>{fixture && <b>TEST DATA · NOT OFFICIAL</b>}</div>
      <div className={s.heading}><h1 id="today-round-title">Today’s round</h1><span>{r.date} <abbr title="New York time">ET</abbr></span></div>
      <div className={s.status} data-state={r.state}><Signal size={17} aria-hidden="true"/><strong>{title}</strong></div>
      <p>{description}</p>
    </header>
    <dl className={s.evidence}>
      <div><dt><Fingerprint size={14} aria-hidden="true"/> Shared data</dt><dd>{r.shared ? "Same snapshot verified" : "Not verified"}</dd>{r.shared && r.round?.snapshotHash && <small title={r.round.snapshotHash}>{r.round.snapshotHash.slice(0,12)}…</small>}</div>
      <div><dt><CalendarClock size={14} aria-hidden="true"/> Market data as of</dt><dd>{r.round?.dataAsOf ?? "Not recorded"}</dd></div>
      <div><dt><Clock3 size={14} aria-hidden="true"/> Results read</dt><dd>{r.readTime ? r.readTime + " ET" : "Not available"}</dd></div>
    </dl>
    <div className={s.ledger}>
      <div className={s.ledgerHead}><h2>Model decisions</h2><span>{r.count} / 4 verified</span></div>
      <ol className={s.models}>
        {r.models.map(m => <li key={m.id} className={s.model}>
          <div className={s.modelHead}><h3>{MODEL_LABELS[m.id]}</h3><span>{m.valid && m.clock ? m.clock + " ET" : "—"}</span></div>
          {!m.valid ? <p className={s.empty}>{m.row?.status === "invalid" || m.row?.status === "error" ? "Decision failed validation" : "No verified decision"}</p> :
            !m.proposed.length ? <p className={s.empty}><b>Hold</b> · No trade proposed</p> :
              <ul className={s.actions}>{m.proposed.map((a,i) => {
                const fill = m.fills.find(f => f.symbol === a.symbol && f.side === a.action);
                const rejected = m.unfilled.find(o => o.symbol === a.symbol && o.side === a.action);
                const ActionIcon = a.action === "BUY" ? ArrowDownLeft : ArrowUpRight;
                const outcome = fill ? "Simulated fill · " + fill.quantity + " shares" : rejected ?
                  (rejected.status === "EXPIRED" ? "Expired · no fill" : "Rejected · no fill") :
                  r.round?.status === "settled" ? "No verified fill" : "No fill recorded yet";
                return <li key={a.symbol + i}><div><ActionIcon size={13} aria-hidden="true"/><strong>{a.action} {a.symbol}</strong><span> · {a.quantity} shares</span></div><small>{outcome}</small></li>;
              })}</ul>}
        </li>)}
      </ol>
      <p className={s.foot}>{r.round ? "Round #" + r.round.id + " · " : ""}Paper trading only. Entries are not backfilled.</p>
    </div>
  </section>;
}
