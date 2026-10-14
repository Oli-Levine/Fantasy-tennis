"use client";

import { useRef } from "react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";

export function AccountMenu({
  name,
  teamName,
  email,
}: {
  name: string;
  teamName?: string;
  email: string;
}) {
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-ink font-heading text-[13px] font-semibold text-white outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {initials(name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            {teamName && <div className="truncate font-heading font-semibold">{teamName}</div>}
            <div className={teamName ? "truncate text-xs" : "truncate font-semibold"}>{name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => signOutForm.current?.requestSubmit()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={signOutForm} action="/auth/signout" method="post" hidden />
    </>
  );
}
