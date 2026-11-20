import { Section } from "@/components/blocks";
import { PageTitle } from "@/components/shell";
import { getData } from "@/lib/data";

export const metadata = { title: "About" };

export default async function About() {
  const d = await getData();
  const e = d.experiment;
  return (
    <div className="space-y-4">
      <PageTitle title="AI는 실제로 주식투자를 잘할까?" sub="AI Invest Lab 실험 규칙과 한계" />
      <Section title="실험 방식">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>GPT, Claude, Gemini, DeepSeek가 각자 가상 ${e.initialCash.toLocaleString()}로 시작해 미국 대형주 30종목 안에서 매수·매도·보유를 결정합니다.</li>
          <li>미국 거래일마다 동부시간 오전 8시 30분, 직전 거래일까지 확정된 일봉과 서버가 계산한 기술적 지표만 제공합니다. 뉴스·인터넷·다른 AI의 판단은 볼 수 없습니다.</li>
          <li>네 AI는 같은 시각, 같은 시장 데이터 스냅샷(해시로 고정)을 받습니다. 각자 다른 것은 자신의 현금·보유 종목·과거 거래뿐입니다.</li>
          <li>주문은 판단 이후 열리는 정규장의 <b>시가</b>로 모의 체결합니다(슬리피지 {e.slippageBps}bp, 수수료 {e.feeBps}bp 가정). 판단 시점에는 이 가격을 알 수 없습니다.</li>
          <li>공매도·레버리지·신용 불가, 정수 주식만, 한 종목은 매수 시점 평가자산의 {Math.round(e.maxPositionWeight * 100)}%까지.</li>
          <li>AI 하나라도 호출에 실패하거나 형식이 틀린 응답을 내면 그 회차의 신규 체결은 전부 보류합니다. 실패 기록도 공개 대상입니다.</li>
          <li>판단·체결·원장 기록은 사후 수정할 수 없도록 데이터베이스에서 막혀 있습니다.</li>
        </ul>
      </Section>
      <Section title="비교 기준">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>SPY 단순 매수·보유 — 시작일 시가에 전액 매수 후 보유</li>
          <li>30종목 균등투자 — 시작일 시가에 30종목을 같은 금액씩 매수 후 보유</li>
          <li>현금 100% — 아무것도 하지 않음</li>
        </ul>
      </Section>
      <Section title="한계와 주의">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>모의투자입니다. 실제 주문이 없으므로 체결 가능 수량, 호가 공백, 세금, 환전 비용 등이 실제와 다릅니다.</li>
          <li>AI 모델의 학습 데이터에 과거 시장 정보가 포함되어 있을 수 있습니다. 판단 이유는 AI가 생성한 문장이며 사실 확인을 거치지 않았습니다.</li>
          <li>표본 기간이 짧으면 순위는 운의 영향을 크게 받습니다. 지표는 표본이 충분할 때만 계산합니다.</li>
          <li>이 사이트는 투자 권유나 개인별 투자 자문을 제공하지 않습니다.</li>
        </ul>
      </Section>
      <Section title="데이터 출처">
        <p className="text-sm text-muted">
          {d.mode === "demo"
            ? "현재 DEMO 모드: 시세는 프로그램이 만든 합성 데이터이고 'AI'는 고정 규칙입니다. 실제 결과와 무관합니다."
            : "시세: NH투자증권 PLUG Open API(시세 조회 전용). AI: OpenRouter 경유 각 모델 고정 버전."}
        </p>
      </Section>
    </div>
  );
}
