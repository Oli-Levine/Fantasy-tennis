import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-panel bg-card px-6 py-12 text-center shadow-soft",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-7" strokeWidth={2} />
      </div>
      <h2 className="text-lg">{title}</h2>
      {description && (
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
