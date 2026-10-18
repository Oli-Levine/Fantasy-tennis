import Link from "next/link";
import { LogoMark } from "@/components/app/logo";
import { AccountMenu } from "@/components/app/account-menu";

export function TopBar({
  name,
  teamName,
  email,
}: {
  name: string;
  teamName?: string;
  email: string;
}) {
  return (
    <header
      className="on-dark sticky top-0 z-40 border-b border-white/10 bg-navy-glass"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-topbar max-w-content items-center justify-between px-gutter">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-heading text-[17px] font-bold tracking-tight">
            Fantasy <span className="text-line-yellow">Tennis</span>
          </span>
        </Link>
        <AccountMenu name={name} teamName={teamName} email={email} />
      </div>
    </header>
  );
}
