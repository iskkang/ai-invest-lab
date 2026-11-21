"use client";

import { useEffect } from "react";

/** Fail closed: a database/API outage must never be replaced with invented returns. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A digest is safe to correlate with server-side logs. Do not display raw DB errors.
    console.error("[ail/web] dashboard unavailable", error.digest ?? "no-digest");
  }, [error]);
  return (
    <section role="alert" className="mx-auto my-12 max-w-2xl rounded-2xl border border-line bg-panel px-6 py-10 text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">DATA UNAVAILABLE · 데이터 연결 오류</p>
      <h1 className="text-xl font-bold">투자 데이터 화면을 불러오지 못했습니다.</h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        실제 AI 판단과 거래 기록을 확인할 수 없습니다. 오류를 감추기 위해 가상의 수익률을 표시하지 않습니다.
        The live research data is temporarily unavailable; no fabricated performance is shown.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">다시 시도 · Retry</button>
        <a className="rounded-lg border border-line px-4 py-2 text-sm" href="/ko/methodology">실험 방식 · Methodology</a>
      </div>
    </section>
  );
}
