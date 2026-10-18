import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminHeader({
  title,
  subtitle,
  action,
  backToAdmin = true,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Captains reach some pages (Results) without access to the Admin hub. */
  backToAdmin?: boolean;
}) {
  return (
    <header className="mb-4">
      {backToAdmin && (
        <Link
          href="/admin"
          className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Admin
        </Link>
      )}
      <div className={cn("flex items-end justify-between gap-3", backToAdmin && "mt-1")}>
        <div className="min-w-0">
          <h1 className="text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
