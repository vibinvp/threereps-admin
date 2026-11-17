"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { canAccess } from "@/lib/permissions";
import { navRoutes } from "./nav-routes";

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.adminData?.role);
  const visible = navRoutes.filter((r) => canAccess(role, r.href));
  // The most specific matching route is the active one (so /trainers/applications
  // doesn't also highlight /trainers).
  const active = [...visible]
    .filter((r) => pathname === r.href || pathname.startsWith(r.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const groups = [...new Set(visible.map((r) => r.group))];

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
      {groups.map((group) => (
        <div key={group} className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{group}</p>
          {visible.filter((r) => r.group === group).map((route) => (
            <Link
              key={route.href}
              href={route.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active === route.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <route.icon className="mr-3 h-5 w-5 flex-shrink-0" />
              {route.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
