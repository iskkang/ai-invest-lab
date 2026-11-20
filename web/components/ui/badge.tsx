import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "default" | "up" | "down" | "warn" | "muted" | "outline";
const styles: Record<Variant, string> = {
  default: "bg-accent/15 text-accent",
  up: "bg-up/12 text-up",
  down: "bg-down/12 text-down",
  warn: "bg-warn/15 text-warn",
  muted: "bg-panel-2 text-muted",
  outline: "border border-line text-muted",
};
export function Badge({ className, variant = "default", ...p }: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none", styles[variant], className)} {...p} />;
}
