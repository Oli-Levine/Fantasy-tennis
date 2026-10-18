import Image from "next/image";
import { cn } from "@/lib/utils";

/** The club crest (public/brand/crest.png, cut out of the UOB Tennis logo). Size it by height. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/crest.png"
      alt=""
      aria-hidden="true"
      width={325}
      height={384}
      priority
      className={cn("h-8 w-auto shrink-0 self-start object-contain", className)}
    />
  );
}
