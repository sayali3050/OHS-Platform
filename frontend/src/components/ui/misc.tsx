import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

type Tone = "neutral" | "safe" | "caution" | "danger" | "info" | "signal";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  safe: "bg-safe/10 text-safe",
  caution: "bg-caution/10 text-caution",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  signal: "bg-signal/20 text-ink",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[13px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-sunken", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-sunken text-muted">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] font-medium text-danger">
      {children}
    </div>
  );
}
