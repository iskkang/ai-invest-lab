import engine from "@/lib/engine-methodology.generated.json";
import { MODEL_TIER_EVIDENCE, type ModelTierId } from "@/lib/model-tiers";
import type { Locale } from "@/lib/public-content";

const TEXT={
  ko:{
    notice:"4개 모델의 크기와 가격대는 서로 같지 않습니다. 실험 결과는 회사 간 우열이 아니라 아래 4개 모델의 비교로 해석해야 합니다.",
    frozen:"동일 실험 기간에는 모델 ID를 변경하지 않는 것이 운영 원칙입니다. 교체가 필요하면 별도의 실험으로 구분하고 변경 이력을 공개합니다.",
    tier:"제공사 라인업 분류",source:"공식 근거",link:"제공사 설명",active:"운영 활성 모델",
    unverified:"DeepSeek-V3.2는 제공사 공식 자료에서 상대적인 소형·중급·대형 등급을 확인하지 못해 공란으로 둡니다.",
    unavailable:"운영 DB 미확인",verified:"확인됨",
  },
  en:{
    notice:"The four models are not matched in size or price tier. Results compare these specific four model versions—not the relative superiority of their companies.",
    frozen:"The policy is to keep model IDs unchanged within an experiment. Any necessary replacement belongs to a separate experiment with a disclosed version history.",
    tier:"Provider lineup / tier",source:"Official source",link:"Provider description",active:"Active model",
    unverified:"DeepSeek-V3.2 has no verified small/medium/large tier in the manufacturer's description; the cell is intentionally blank.",
    unavailable:"Active DB unverified",verified:"Verified",
  },
  zh:{
    notice:"四个模型的规模和价格档次并不一致。结果只能解读为这四个具体模型的比较，而非厂商之间的优劣排名。",
    frozen:"同一实验期间原则上不更换模型 ID。如需更换，将作为独立实验并公开版本变更记录。",
    tier:"厂商产品线定位",source:"官方依据",link:"厂商说明",active:"当前生效模型",
    unverified:"未能从 DeepSeek 官方资料确认 V3.2 在小型、中型、大型中的相对档次，因此留空。",
    unavailable:"无法核实运行数据库",verified:"已核实",
  },
  ja:{
    notice:"4つのモデルは規模も価格帯も同じではありません。結果は企業の優劣ではなく、この4つのモデルの比較として解釈してください。",
    frozen:"同一実験中はモデルIDを変更しない方針です。変更が必要なら別実験としてバージョン履歴を公開します。",
    tier:"提供元のモデル分類",source:"公式資料",link:"提供元の説明",active:"運用中のモデル",
    unverified:"DeepSeek-V3.2の小型・中型・大型などの相対的区分は公式資料で確認できないため、空欄にしています。",
    unavailable:"運用DB未確認",verified:"確認済み",
  },
} as const;

/** Source model IDs are never duplicated here: Python exporter owns them.
 * All official tier citations link directly to the original manufacturer.
 */
export function ModelDisclosure({locale,activeModels,dark=false}:{
  locale:Locale;
  activeModels?:ReadonlyMap<string,string>;
  dark?:boolean;
}){
  const c=TEXT[locale];
  const baseText=dark?"text-[#e0e8f8]":"text-muted";
  const headingColor=dark?"text-white":"text-fg";
  const border=dark?"border-white/20":"border-line";
  return <div data-model-disclosure="true" className="min-w-0 w-full max-w-full space-y-3">
    <p className={"text-sm font-semibold leading-6 "+headingColor}>{c.notice}</p>
    <p className={"text-xs leading-6 "+baseText}>{c.frozen}</p>
    <div className={"min-w-0 w-full max-w-full rounded-xl border "+border}>
      <table className="model-disclosure-table w-full text-left text-xs">
        <thead className={"border-b "+border}>
          <tr>
            <th scope="col" className="p-3">AI</th>
            <th scope="col" className="p-3">OpenRouter ID</th>
            <th scope="col" className="p-3">{c.tier}</th>
            <th scope="col" className="p-3">{c.source}</th>
            {activeModels&&<th scope="col" className="p-3">{c.active}</th>}
          </tr>
        </thead>
        <tbody>{engine.models.map(model=>{
          const evidence=MODEL_TIER_EVIDENCE[model.id as ModelTierId];
          const tier=evidence?.tier[locale]??"";
          return <tr key={model.id} className={"border-b last:border-0 "+border} data-model-id={model.id}>
            <th scope="row" className="p-3 font-bold">{model.name}</th>
            <td className="break-all p-3 font-mono">{model.model}</td>
            <td className="p-3" data-tier={model.id}>{tier}</td>
            <td className="p-3"><a href={evidence.source} target="_blank"
              rel="noopener noreferrer" className="whitespace-nowrap underline underline-offset-2">
              {c.link}
            </a></td>
            {activeModels&&<td className="break-all p-3 font-mono">{activeModels.get(model.id)?<><span>{activeModels.get(model.id)}</span><span className="ml-2 whitespace-nowrap font-sans text-[10px] font-semibold text-accent">{c.verified}</span></>:c.unavailable}</td>}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className={"text-xs leading-6 "+baseText}>{c.unverified}</p>
  </div>;
}
