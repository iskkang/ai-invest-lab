"use client";

/** Last-resort boundary, including a layout render failure. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "12vh 24px", color: "#1e293b", background: "#f8fafc" }}>
        <main style={{ maxWidth: 620, margin: "auto" }}>
          <h1>LogicSight을 불러오지 못했습니다.</h1>
          <p>현재 데이터 또는 사이트 연결에 문제가 있습니다. 실제 성과를 확인할 수 없어 임의 수익률은 표시하지 않습니다.</p>
          <p>LogicSight is temporarily unavailable. No synthetic results are substituted for live data.</p>
          <button onClick={() => reset()} style={{ cursor: "pointer", padding: "12px 18px", border: "1px solid #94a3b8", borderRadius: 8 }}>다시 시도 / Retry</button>
        </main>
      </body>
    </html>
  );
}
