import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card-shadow rounded-2xl border border-line bg-panel", className)} {...p} />;
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 px-4 pt-4 pb-2", className)} {...p} />;
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold tracking-tight", className)} {...p} />;
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...p} />;
}
