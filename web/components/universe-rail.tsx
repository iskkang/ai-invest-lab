import Link from "next/link";
import { ListChecks } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { universeRows } from "@/lib/stock";
import { cn, fmtNum, fmtPct } from "@/lib/utils";
import { Card } from "./ui/card";
import { localizedHref, t } from "@/lib/i18n";

/** 우측 패널: 투자 대상 종목 + 어떤 AI 가 보유 중인지 */
export function UniverseRail({ d, current }: { d: Dataset; current?: string }) {
  const rows = universeRows(d).sort((a, b) => b.holders.length - a.holders.length || a.symbol.localeCompare(b.symbol));
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 font-bold"><ListChecks size={18} aria-hidden />투자 대상 {t(d.locale,"투자 대상 종목")}</h2>
        <span className="text-[11px] text-muted">{rows.length} {t(d.locale,"종목")}</span>
      </div>
      <p className="mb-2 px-1 text-[11px] text-muted">{t(d.locale,"점 = 현재 보유 중인 AI")}</p>
      <ul className="max-h-[640px] space-y-0.5 overflow-y-auto pr-1">
        {rows.map((r) => (
          <li key={r.symbol}>
            <Link href={localizedHref(d.locale, `/stocks/${r.symbol}`)}
              className={cn("flex items-center gap-2 rounded-lg px-2 py-2 text-sm", r.symbol === current ? "bg-accent/10" : "hover:bg-panel-2")}>
              <span className="w-14 font-semibold">{r.symbol}</span>
              <span className="flex w-12 gap-0.5">
                {r.holders.map((a) => <span key={a.id} title={a.name} className="h-2 w-2 rounded-full" style={{ background: a.color }} />)}
              </span>
              <span className="ml-auto tabular">{fmtNum(r.close)}</span>
              <span className={cn("w-16 rounded-md px-1.5 py-0.5 text-right text-xs font-semibold tabular",
                (r.changePct ?? 0) > 0 ? "bg-up/10 text-up" : (r.changePct ?? 0) < 0 ? "bg-down/10 text-down" : "text-muted")}>
                {fmtPct(r.changePct)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
