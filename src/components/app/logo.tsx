import { cn } from "@/lib/utils";

/** Red tennis-ball mark used in the top bar, login screen and favicon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <circle cx="16" cy="16" r="15" fill="var(--brand-red)" />
      <path
        d="M4.5 8.5c5.5 2.2 8.5 7.6 7.6 13.8M27.5 23.5c-5.5-2.2-8.5-7.6-7.6-13.8"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
