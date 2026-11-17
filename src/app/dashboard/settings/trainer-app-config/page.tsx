"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
  trainer_maintenance_mode: z.boolean(),
  trainer_maintenance_title: z.string().min(1, "Title is required"),
  trainer_maintenance_message: z.string().min(1, "Message is required"),
  
  trainer_force_update_enabled: z.boolean(),
  trainer_minimum_android_version: z.string().min(1, "Version is required"),
  trainer_minimum_ios_version: z.string().min(1, "Version is required"),
  trainer_latest_android_version: z.string().min(1, "Version is required"),
  trainer_latest_ios_version: z.string().min(1, "Version is required"),
  
  trainer_update_title: z.string().min(1, "Title is required"),
  trainer_update_message: z.string().min(1, "Message is required"),
  trainer_android_store_url: z.string(),
  trainer_ios_store_url: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export default function AppConfigPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trainer_maintenance_mode: false,
      trainer_maintenance_title: "Maintenance",
      trainer_maintenance_message: "3REPS Fitness is currently under maintenance. Please try again later.",
      
      trainer_force_update_enabled: false,
      trainer_minimum_android_version: "1.0.3",
      trainer_minimum_ios_version: "1.0.3",
      trainer_latest_android_version: "1.0.3",
      trainer_latest_ios_version: "1.0.3",
      
      trainer_update_title: "Update Required",
      trainer_update_message: "Please update the 3REPS Fitness Trainer app to continue.",
      trainer_android_store_url: "",
      trainer_ios_store_url: "",
    },
  });

  useEffect(() => {
    async function fetchConfig() {
      try {
        const token = await user?.getIdToken();
        if (!token) return;

        const res = await fetch('/api/config', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch config');
        }

        const params = data.parameters || {};
        
        const getVal = (key: string, type: 'string' | 'boolean', fallback: any) => {
          if (params[key] && params[key].defaultValue) {
             const val = params[key].defaultValue.value;
             if (type === 'boolean') return val === 'true';
             return val;
          }
          return fallback;
        };

        reset({
          trainer_maintenance_mode: getVal('trainer_maintenance_mode', 'boolean', false),
          trainer_maintenance_title: getVal('trainer_maintenance_title', 'string', 'Maintenance'),
          trainer_maintenance_message: getVal('trainer_maintenance_message', 'string', '3REPS Fitness is currently under maintenance. Please try again later.'),
          
          trainer_force_update_enabled: getVal('trainer_force_update_enabled', 'boolean', false),
          trainer_minimum_android_version: getVal('trainer_minimum_android_version', 'string', '1.0.3'),
          trainer_minimum_ios_version: getVal('trainer_minimum_ios_version', 'string', '1.0.3'),
          trainer_latest_android_version: getVal('trainer_latest_android_version', 'string', '1.0.3'),
          trainer_latest_ios_version: getVal('trainer_latest_ios_version', 'string', '1.0.3'),
          
          trainer_update_title: getVal('trainer_update_title', 'string', 'Update Required'),
          trainer_update_message: getVal('trainer_update_message', 'string', 'Please update the 3REPS Fitness Trainer app to continue.'),
          trainer_android_store_url: getVal('trainer_android_store_url', 'string', ''),
          trainer_ios_store_url: getVal('trainer_ios_store_url', 'string', ''),
        });
      } catch (err: any) {
        setError(err.message);
        toast.error("Failed to load configuration", { description: err.message });
      } finally {
        setLoading(false);
      }
    }
    if (user) {
      fetchConfig();
    }
  }, [reset, user]);

  async function onSubmit(data: FormValues) {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      for (const [key, val] of Object.entries(data)) {
        updates[key] = {
           defaultValue: { value: String(val) }
        };
      }

      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ updates })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to save config');
      }

      toast.success("Configuration saved successfully!");
    } catch (err: any) {
      toast.error("Failed to save configuration", { description: err.message });
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
        <h2 className="text-3xl font-bold tracking-tight">Trainer App Configuration</h2>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive mb-6">
          <p className="font-semibold">Configuration Blocker Detected</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 text-muted-foreground">Note: Please ensure FIREBASE_CLIENT_EMAIL is configured in .env.local</p>
        </div>
      )}

      <div className="mx-auto max-w-2xl mt-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          
          {/* MAINTENANCE MODE */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Maintenance Mode</h3>
            <p className="text-sm text-muted-foreground">Enable to block all user access to the app.</p>
            
            <Controller
              control={control}
              name="trainer_maintenance_mode"
              render={({ field }) => (
                <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Enable Maintenance</Label>
                  </div>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />

            {watch('trainer_maintenance_mode') && (
              <div className="space-y-4 pl-4 border-l-2">
                <Controller
                  control={control}
                  name="trainer_maintenance_title"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label>Maintenance Title</Label>
                      <Input {...field} />
                      {errors.trainer_maintenance_title && <p className="text-sm text-destructive">{errors.trainer_maintenance_title.message}</p>}
                    </div>
                  )}
                />
                <Controller
                  control={control}
                  name="trainer_maintenance_message"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label>Maintenance Message</Label>
                      <Textarea {...field} />
                      {errors.trainer_maintenance_message && <p className="text-sm text-destructive">{errors.trainer_maintenance_message.message}</p>}
                    </div>
                  )}
                />
              </div>
            )}
          </div>

          <Separator />

          {/* FORCE UPDATE */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Force Update</h3>
            <p className="text-sm text-muted-foreground">Force users to update their app to the minimum required version.</p>
            
            <Controller
              control={control}
              name="trainer_force_update_enabled"
              render={({ field }) => (
                <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Enable Force Update Checks</Label>
                  </div>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <Controller
                control={control}
                name="trainer_minimum_android_version"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Min Android Version</Label>
                    <Input {...field} />
                    {errors.trainer_minimum_android_version && <p className="text-sm text-destructive">{errors.trainer_minimum_android_version.message}</p>}
                  </div>
                )}
              />
              <Controller
                control={control}
                name="trainer_minimum_ios_version"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Min iOS Version</Label>
                    <Input {...field} />
                    {errors.trainer_minimum_ios_version && <p className="text-sm text-destructive">{errors.trainer_minimum_ios_version.message}</p>}
                  </div>
                )}
              />
              <Controller
                control={control}
                name="trainer_latest_android_version"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Latest Android Version</Label>
                    <Input {...field} />
                    {errors.trainer_latest_android_version && <p className="text-sm text-destructive">{errors.trainer_latest_android_version.message}</p>}
                  </div>
                )}
              />
              <Controller
                control={control}
                name="trainer_latest_ios_version"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Latest iOS Version</Label>
                    <Input {...field} />
                    {errors.trainer_latest_ios_version && <p className="text-sm text-destructive">{errors.trainer_latest_ios_version.message}</p>}
                  </div>
                )}
              />
            </div>

            <Controller
              control={control}
              name="trainer_update_title"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>Update Title</Label>
                  <Input {...field} />
                  {errors.trainer_update_title && <p className="text-sm text-destructive">{errors.trainer_update_title.message}</p>}
                </div>
              )}
            />
            <Controller
              control={control}
              name="trainer_update_message"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>Update Message</Label>
                  <Textarea {...field} />
                  {errors.trainer_update_message && <p className="text-sm text-destructive">{errors.trainer_update_message.message}</p>}
                </div>
              )}
            />
            <Controller
              control={control}
              name="trainer_android_store_url"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>Android Store URL</Label>
                  <Input {...field} placeholder="https://play.google.com/..." />
                </div>
              )}
            />
            <Controller
              control={control}
              name="trainer_ios_store_url"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>iOS Store URL</Label>
                  <Input {...field} placeholder="https://apps.apple.com/..." />
                </div>
              )}
            />
          </div>

          <Button type="submit" disabled={saving || !!error} className="w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Configuration
          </Button>
        </form>
      </div>
    </div>
  );
}
