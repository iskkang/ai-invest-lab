import Link from "next/link";
import { headers } from "next/headers";
import { isLocale } from "@/lib/public-content";
import { t, localizedHref } from "@/lib/i18n";
export default async function NotFound() {
  const candidate=(await headers()).get("x-ail-locale")??"ko";
  const locale=isLocale(candidate)?candidate:"ko";
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold">{t(locale,"페이지를 찾을 수 없습니다")}</p>
      <Link href={localizedHref(locale,"/")} className="mt-3 inline-block text-sm text-accent">{t(locale,"대시보드로")}</Link>
    </div>
  );
}
