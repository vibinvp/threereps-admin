import {
  LayoutDashboard, Users, Calendar, Dumbbell, Settings, ShieldAlert, FileText, Tags, Award,
  Languages, MapPin, Image, Globe, Bell, CreditCard, BookOpen, ClipboardCheck, LifeBuoy,
  UserCheck, ScrollText, type LucideIcon,
} from "lucide-react";

export type NavRoute = { href: string; label: string; icon: LucideIcon; group: string };

export const navRoutes: NavRoute[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/dashboard/bookings", label: "Bookings", icon: Calendar, group: "Operations" },
  { href: "/dashboard/attendance", label: "Attendance", icon: ClipboardCheck, group: "Operations" },
  { href: "/dashboard/trainers", label: "Trainers", icon: Dumbbell, group: "People" },
  { href: "/dashboard/trainers/applications", label: "Applications", icon: UserCheck, group: "People" },
  { href: "/dashboard/trainer-tiers", label: "Trainer Tiers", icon: Award, group: "People" },
  { href: "/dashboard/users", label: "Users", icon: Users, group: "People" },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, group: "Finance" },
  { href: "/dashboard/ledger", label: "Ledger", icon: BookOpen, group: "Finance" },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy, group: "Support" },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell, group: "Content" },
  { href: "/dashboard/banners", label: "Banners", icon: Image, group: "Content" },
  { href: "/dashboard/categories", label: "Categories", icon: Tags, group: "Content" },
  { href: "/dashboard/languages", label: "Languages", icon: Languages, group: "Content" },
  { href: "/dashboard/service-areas", label: "Service Areas", icon: MapPin, group: "Content" },
  { href: "/dashboard/landing-page", label: "Landing Page", icon: Globe, group: "Content" },
  { href: "/dashboard/cms", label: "CMS", icon: FileText, group: "Content" },
  { href: "/dashboard/legal", label: "Legal", icon: ShieldAlert, group: "Content" },
  { href: "/dashboard/audit-logs", label: "Audit Log", icon: ScrollText, group: "System" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, group: "System" },
];
