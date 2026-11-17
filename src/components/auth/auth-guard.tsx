"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { canAccess } from "@/lib/permissions";
import { useAuthStore } from "@/lib/stores/auth-store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, adminData } = useAuthStore();
  const allowed = !adminData || canAccess(adminData.role, pathname);

  useEffect(() => {
    // In a real scenario, this is where Firebase auth state listener updates the store
    // For now, if we finish loading and are not authenticated, redirect
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
    if (!isLoading && isAuthenticated && !allowed) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, allowed, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If not authenticated, we return null while redirect happens
  if (!isAuthenticated || !allowed) {
    return null;
  }

  return <>{children}</>;
}
