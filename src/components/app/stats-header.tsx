import { cn } from "@/lib/utils";

export type Stat = { label: string; value: React.ReactNode };

/**
 * The stats bar from the reference design: big numbers with small grey labels,
 * optional actions on the right, and a thin divider underneath.
 */
export function StatsHeader({
  stats,
  title,
  eyebrow,
  actions,
  className,
}: {
  stats: Stat[];
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border pb-4", className)}>
      {(eyebrow || actions) && (
        <div className="mb-1 flex min-h-9 items-center justify-between gap-3">
          <div className="min-w-0">{eyebrow}</div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {title && <h2 className="mb-4 text-xl leading-tight break-words">{title}</h2>}
      <dl
        className="grid gap-x-2 gap-y-3"
        style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dd className="truncate font-heading text-[19px] leading-tight font-semibold tabular-nums">
              {stat.value}
            </dd>
            <dt className="mt-0.5 truncate text-xs text-muted-foreground">{stat.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
