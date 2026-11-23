import {CloseArchive} from "@/components/market-close";
export const metadata = {title:"Market Close | LogicSight"};
export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}) {
  return <CloseArchive date={(await searchParams).date}/>;
}
