import { UserAppConfigClient } from "./user-app-config-client";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "User App Configuration | 3REPS Admin",
  description: "Manage User App configuration parameters",
};

export default function UserAppConfigPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">User App Configuration</h2>
      </div>
      <div className="mx-auto max-w-4xl mt-8">
        <UserAppConfigClient />
      </div>
    </div>
  );
}
