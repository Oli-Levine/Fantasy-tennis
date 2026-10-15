import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-5 w-20" />
      <div className="space-y-4 rounded-panel bg-card p-4 shadow-soft">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[5/4] w-full rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
