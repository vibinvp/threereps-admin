"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Dumbbell,
  Settings,
  ShieldAlert,
  FileText,
  Tags,
  Award,
  Languages,
  MapPin,
  Image,
  Globe,
  Bell
} from "lucide-react";

const routes = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Bookings", icon: Calendar },
  { href: "/dashboard/trainers", label: "Trainers", icon: Dumbbell },
  { href: "/dashboard/trainer-tiers", label: "Trainer Tiers", icon: Award },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/banners", label: "Banners", icon: Image },
  { href: "/dashboard/categories", label: "Categories", icon: Tags },
  { href: "/dashboard/languages", label: "Languages", icon: Languages },
  { href: "/dashboard/service-areas", label: "Service Areas", icon: MapPin },
  { href: "/dashboard/landing-page", label: "Landing Page", icon: Globe },
  { href: "/dashboard/cms", label: "CMS", icon: FileText },
  { href: "/dashboard/legal", label: "Legal", icon: ShieldAlert },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-card flex flex-col h-full hidden md:flex">
      <div className="h-16 flex items-center px-6 border-b font-bold text-xl tracking-tight text-primary">
        ThreeReps Admin
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
              pathname === route.href || pathname.startsWith(route.href + '/')
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <route.icon className="mr-3 h-5 w-5 flex-shrink-0" />
            {route.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
