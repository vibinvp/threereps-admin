"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";
import { taxConfigService } from "@/lib/services/taxConfigService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TaxSettingsPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gstPercentage, setGstPercentage] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    taxConfigService
      .get()
      .then((config) => {
        if (!cancelled) setGstPercentage(String(config.gstPercentage ?? 0));
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(gstPercentage);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Enter a valid GST percentage between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      await taxConfigService.set(parsed, user?.uid || "unknown");
      toast.success("GST percentage updated. New bookings will use this rate.");
    } catch (err: any) {
      toast.error("Failed to save GST percentage", { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Tax Settings</h2>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive mb-6">
          <p className="font-semibold">Failed to load current GST rate</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="mx-auto max-w-2xl mt-8">
        <Card>
          <CardHeader>
            <CardTitle>GST</CardTitle>
            <CardDescription>
              Applied on top of every trainer&apos;s configured plan price when a booking
              is created. Changing this only affects new bookings going forward &mdash;
              it does not retroactively change existing bookings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="gstPercentage">GST Percentage (%)</Label>
                <Input
                  id="gstPercentage"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={gstPercentage}
                  onChange={(e) => setGstPercentage(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save GST Rate"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
