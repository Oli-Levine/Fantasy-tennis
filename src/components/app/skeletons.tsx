import { Skeleton } from "@/components/ui/skeleton";

/** Page title + subtitle placeholder. */
export function HeaderSkeleton() {
  return (
    <div className="mb-4 space-y-2">
      <Skeleton className="h-7 w-36" />
      <Skeleton className="h-4 w-56" />
    </div>
  );
}

/** A rounded panel of list rows (League, Admin lists, player pool). */
export function ListSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="overflow-hidden rounded-panel bg-card shadow-soft">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0">
          {avatar && <Skeleton className="size-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-10" />
        </div>
      ))}
    </div>
  );
}

/** A panel of text lines (Rules sections). */
export function TextPanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-panel bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-xl" />
        <Skeleton className="h-5 w-32" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${90 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  );
}
