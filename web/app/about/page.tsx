import { Section } from "@/components/blocks";
import { PageTitle } from "@/components/shell";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";
import { PUBLIC_COPY } from "@/lib/public-content";

export const metadata = {title:"About"};
export default async function About() {
  const d = await getData();
  const c = PUBLIC_COPY[d.locale];
  return (
    <div className="space-y-4">
      <PageTitle title={t(d.locale,"AI는 실제로 주식투자를 잘할까?")}
        sub={t(d.locale,"AI Invest Lab 실험 규칙과 한계")}/>
      <Section title={t(d.locale,"실험 방식")}>
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
      <Section title={t(d.locale,"비교 기준")}>
        <p className="text-sm leading-7 text-muted">{c.metrics[3][1]} — SPY, an equal-weight benchmark and a cash-only benchmark.</p>
      </Section>
      <Section title={t(d.locale,"한계와 주의")}>
        <p className="text-sm leading-7 text-muted">{c.safety}</p>
        <p className="mt-2 text-sm leading-7 text-muted">{c.currentBody}</p>
      </Section>
      <Section title={t(d.locale,"데이터 출처")}>
        <p className="text-sm leading-7 text-muted">{c.footnote}</p>
      </Section>
    </div>
  );
}
