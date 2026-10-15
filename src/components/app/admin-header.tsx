import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function AdminHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4">
      <Link
        href="/admin"
        className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Admin
      </Link>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
