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
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <div className="mb-1">{eyebrow}</div>}
            {title && <h2 className="truncate text-xl leading-tight">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
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
