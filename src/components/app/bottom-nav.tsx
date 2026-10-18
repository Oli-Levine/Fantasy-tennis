"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, Home, Shield, Trophy, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/team", label: "Team", icon: Users },
  { href: "/league", label: "League", icon: Trophy },
  { href: "/rules", label: "Rules", icon: BookOpen },
];

const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: Shield };
const RESULTS_ITEM: NavItem = { href: "/results", label: "Results", icon: ClipboardList };

function isActive(pathname: string, href: string) {
  if (href === "/admin" && pathname === "/results") return true; // admins reach Results from the Admin hub
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Admins get Admin (Results lives inside it); team captains get Results. */
export function BottomNav({ showAdmin = false, showResults = false }: { showAdmin?: boolean; showResults?: boolean }) {
  const pathname = usePathname();
  const items = showAdmin ? [...ITEMS, ADMIN_ITEM] : showResults ? [...ITEMS, RESULTS_ITEM] : ITEMS;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 shadow-nav backdrop-blur supports-[backdrop-filter]:bg-surface/85"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-nav max-w-content items-stretch justify-around px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary-soft",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
