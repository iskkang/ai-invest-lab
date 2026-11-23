import Link from "next/link";
import entries from "@/lib/market-close.json";

type Report = {date:string; publishedAt:string; title:string; summary:string; close:string; drivers:string; review:string; outlook:string; sources:{name:string;url:string}[]};
const reports: Report[] = entries;
const archive = "/en/market-close";
export function ClosePreview() {
  const latest = reports[0];
  return <section className="mx-auto max-w-6xl p-5"><h2 className="text-xl font-semibold"><Link href={archive}>Market Close</Link></h2>
    {latest ? <><Link className="font-semibold text-accent" href={archive+"?date="+latest.date}>{latest.title}</Link><p>{latest.summary}</p></> : <p className="text-muted">The first closing report will appear after the US trading session.</p>}</section>;
}
export function CloseArchive({date}:{date?:string}) {
  const report = date ? reports.find(item=>item.date===date) : reports[0];
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8"><h1 className="text-3xl font-semibold">Market Close</h1>
    {report ? <article className="space-y-4"><p className="text-muted">{report.date} US session · Published {report.publishedAt}</p>
      <h2 className="text-2xl font-semibold">{report.title}</h2><p>{report.summary}</p>
      {report.review && <p><strong>Previous outlook. </strong>{report.review}</p>}
      <p>{report.close}</p><h3 className="font-semibold">What drove the move</h3><p>{report.drivers}</p>
      <p className="text-sm">Sources · {report.sources.map(s=><a key={s.url} className="mr-3 underline" href={s.url}>{s.name}</a>)}</p>
      <h3 className="font-semibold">Next session outlook</h3><p>{report.outlook}</p></article>
    : <p>{date ? "No report for this session." : "Awaiting the first US market close report."}</p>}
    {reports.length>0 && <nav aria-label="Market close archive"><h2 className="font-semibold">Past sessions</h2>{reports.map(r=><Link key={r.date} className="block py-1 text-accent" href={archive+"?date="+r.date}>{r.date} · {r.title}</Link>)}</nav>}</main>;
}
