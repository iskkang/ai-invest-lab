import { cn } from "@/lib/utils";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return <div className="overflow-x-auto"><table className={cn("w-full text-sm tabular", className)} {...p} /></div>;
}
export function Th({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-line px-3 py-2 text-left text-xs font-medium text-muted", className)} {...p} />;
}
export function Td({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("whitespace-nowrap border-b border-line/60 px-3 py-2", className)} {...p} />;
}
