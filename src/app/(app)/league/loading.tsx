import { HeaderSkeleton, ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      <ListSkeleton rows={8} />
    </div>
  );
}
