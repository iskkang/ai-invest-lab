import Link from "next/link";
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold">페이지를 찾을 수 없습니다</p>
      <Link href="/" className="mt-3 inline-block text-sm text-accent">대시보드로</Link>
    </div>
  );
}
