import { Section } from "@/components/blocks";
import { PageTitle } from "@/components/shell";
import { headers } from "next/headers";
import { t } from "@/lib/i18n";
import { PUBLIC_COPY, isLocale } from "@/lib/public-content";
import { EngineMethodologyDetails } from "@/components/engine-methodology-details";
import { loadActiveMethodology } from "@/lib/methodology-runtime";

export const metadata = {title:"About"};
export default async function About() {
  const candidate = (await headers()).get("x-ail-locale") ?? "ko";
  const locale = isLocale(candidate) ? candidate : "ko";
  const c = PUBLIC_COPY[locale];
  const active = await loadActiveMethodology();
  return (
    <div className="space-y-4">
      <PageTitle title={t(locale,"AI는 실제로 주식투자를 잘할까?")}
        sub={t(locale,"MarketSights 실험 규칙과 한계")}/>
      <Section title={t(locale,"실험 방식")}>
        <p className="mb-4 text-sm leading-7 text-muted">{c.aboutMethod}</p>
        <ol className="space-y-4">
          {c.method.map(m=>(
            <li key={m.heading} className="border-b border-line pb-4 last:border-0">
              <h2 className="text-sm font-semibold">{m.heading}</h2>
              <p className="mt-1 text-sm leading-7 text-muted">{m.body}</p>
            </li>
          ))}
        </ol>
      </Section>
      <EngineMethodologyDetails locale={locale} active={active}/>
      <Section title={t(locale,"비교 기준")}>
        <p className="text-sm leading-7 text-muted">{c.metrics[3][1]} — {t(locale,"SPY, 30종목 균등투자 및 현금 100% 벤치마크를 비교합니다.")}</p>
      </Section>
      <Section title={t(locale,"한계와 주의")}>
        <p className="text-sm leading-7 text-muted">{c.safety}</p>
        <p className="mt-2 text-sm leading-7 text-muted">{c.currentBody}</p>
      </Section>
      <Section title={t(locale,"데이터 출처")}>
        <p className="text-sm leading-7 text-muted">{c.footnote}</p>
      </Section>
    </div>
  );
}
