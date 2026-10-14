import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Player photo, or their initials on red when there's no photo. */
export function PlayerPhoto({
  name,
  photoUrl,
  className,
  initialsClassName,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
  initialsClassName?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URLs; optimisation comes later
      <img src={photoUrl} alt={name} className={cn("size-full object-cover object-top", className)} />
    );
  }
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "flex aspect-square items-center justify-center rounded-full bg-primary font-heading font-bold text-white",
        className,
      )}
    >
      <span className={initialsClassName}>{initials(name)}</span>
    </div>
  );
}
