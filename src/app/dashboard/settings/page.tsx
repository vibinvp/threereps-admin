import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, UserCog, Medal, Smartphone, Percent } from "lucide-react";

const settingPages = [
  {
    title: "Trainer App Config",
    description: "Manage configurations for the Trainer mobile application.",
    href: "/dashboard/settings/trainer-app-config",
    icon: Smartphone,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    title: "User App Config",
    description: "Manage configurations for the User mobile application.",
    href: "/dashboard/settings/user-app-config",
    icon: UserCog,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    title: "Trainer Tiers",
    description: "Configure subscription tiers and pricing for trainers.",
    href: "/dashboard/trainer-tiers",
    icon: Medal,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
  },
  {
    title: "Tax Settings",
    description: "Set the GST percentage applied to every booking.",
    href: "/dashboard/settings/tax",
    icon: Percent,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
];

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center">
          <Settings className="mr-3 h-8 w-8 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage system configurations and application settings.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {settingPages.map((page) => (
          <Link key={page.href} href={page.href}>
            <Card className="hover:border-primary/50 transition-colors h-full">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${page.bg}`}>
                    <page.icon className={`w-6 h-6 ${page.color}`} />
                  </div>
                  <CardTitle className="text-xl">{page.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {page.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
