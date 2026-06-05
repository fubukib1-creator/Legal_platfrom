"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { navLinksForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Props = {
  user: { name: string; email: string; role: Role; department: string };
  children: React.ReactNode;
};

const roleLabel: Record<Role, string> = {
  ADMIN: "Admin",
  LEGAL_LEAD: "Legal lead",
  LEGAL_REVIEWER: "Legal reviewer",
  BU_MANAGER: "BU manager",
  BU_MEMBER: "BU member",
};

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const links = navLinksForRole(user.role);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/contracts" className="text-base font-semibold tracking-tight">
            INNOPOWER LEGAL
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">
                {roleLabel[user.role]} · {user.department}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        <nav className="hidden w-48 shrink-0 flex-col gap-1 md:flex">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
