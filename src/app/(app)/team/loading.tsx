import { ListSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="space-y-4 rounded-panel bg-card p-4 shadow-soft">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[5/4] w-full rounded-card" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-card" />
      </div>
      <ListSkeleton rows={5} />
    </div>
  );
}
