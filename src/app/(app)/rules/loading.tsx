import { HeaderSkeleton, TextPanelSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <HeaderSkeleton />
      <TextPanelSkeleton lines={3} />
      <TextPanelSkeleton lines={4} />
      <TextPanelSkeleton lines={5} />
    </div>
  );
}
