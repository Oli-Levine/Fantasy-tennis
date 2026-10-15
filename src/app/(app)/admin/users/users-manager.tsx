"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Shield, ShieldOff, UserX } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Database } from "@/lib/database.types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { removeUser, setRole } from "./actions";

type AdminUser = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];

export function UsersManager({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeRole(user: AdminUser) {
    startTransition(async () => {
      const result = await setRole(user.id, user.role === "admin" ? "user" : "admin");
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${user.display_name}: ${result.message?.toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <ul className="overflow-hidden rounded-panel bg-card shadow-soft">
      {users.map((user) => {
        const isMe = user.id === currentUserId;
        return (
          <li key={user.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-sm font-semibold",
                user.role === "admin" ? "bg-gold text-ink" : "bg-muted text-foreground",
              )}
            >
              {initials(user.display_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{user.display_name}</span>
                {isMe && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.team_name ?? (user.joined_at ? "No team name yet" : "Hasn't entered the join code")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                {user.role === "admin" && <Tag tone="gold">Admin</Tag>}
                {!user.joined_at && <Tag tone="danger">Not joined</Tag>}
                {user.is_test_data && <Tag>Test</Tag>}
              </span>
            </span>
            {!isMe && (
              <ConfirmDialog
                title={`Remove ${user.display_name}?`}
                description={
                  <>
                    This deletes their sign-in, team, squad and history. They can sign in again later, but would need the
                    join code and start from scratch. <strong>This can&apos;t be undone.</strong>
                  </>
                }
                confirmLabel="Remove user"
                destructive
                onConfirm={async () => {
                  const result = await removeUser(user.id);
                  if (!result.ok) return void toast.error(result.error);
                  toast.success(`${user.display_name} removed`);
                  router.refresh();
                }}
                trigger={(openRemove) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.display_name}`} disabled={pending}>
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {user.joined_at && (
                        <DropdownMenuItem onSelect={() => changeRole(user)}>
                          {user.role === "admin" ? <ShieldOff /> : <Shield />}
                          {user.role === "admin" ? "Remove admin" : "Make admin"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem variant="destructive" onSelect={openRemove}>
                        <UserX />
                        Remove user
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "gold" | "danger" }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        tone === "gold" && "bg-gold-soft text-gold-ink",
        tone === "danger" && "bg-primary-soft text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
