import Link from "next/link";
import { LogoMark } from "@/components/app/logo";
import { AccountMenu } from "@/components/app/account-menu";

export function TopBar({ name, email }: { name: string; email: string }) {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-topbar max-w-content items-center justify-between px-gutter">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-heading text-[17px] font-bold tracking-tight">
            Fantasy <span className="text-primary">Tennis</span>
          </span>
        </Link>
        <AccountMenu name={name} email={email} />
      </div>
    </header>
  );
}
