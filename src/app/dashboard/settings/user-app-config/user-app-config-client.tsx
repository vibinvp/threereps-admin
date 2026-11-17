"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ManagedRemoteConfig = {
  app_update_enabled: boolean;
  force_update_enabled: boolean;
  android_min_version: string;
  android_latest_version: string;
  android_store_url: string;
  ios_min_version: string;
  ios_latest_version: string;
  ios_store_url: string;
  update_title: string;
  update_message: string;
  maintenance_mode: boolean;
  maintenance_title: string;
  maintenance_message: string;
  config_version: number;
  feature_new_booking_flow: boolean;
  feature_training_profile: boolean;
  feature_qr_attendance: boolean;
  feature_trial_booking: boolean;
  feature_subscription_booking: boolean;
};

export function UserAppConfigClient() {
  const { user } = useAuthStore();
  
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<ManagedRemoteConfig | null>(null);
  const [config, setConfig] = useState<ManagedRemoteConfig | null>(null);
  const [etag, setEtag] = useState<string>("");
  
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const token = await user?.getIdToken();
      if (!token) return;

      const res = await fetch("/api/remote-config", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch configuration");
      
      setOriginalConfig(data.config);
      setConfig(JSON.parse(JSON.stringify(data.config)));
      setEtag(data.etag);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchConfig();
    }
  }, [user, fetchConfig]);



  const handlePublish = async () => {
    try {
      setPublishing(true);
      const token = await user?.getIdToken();
      if (!token) return;

      const res = await fetch("/api/remote-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newConfig: config, currentETag: etag })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish configuration");
      
      toast.success(data.message);
      setOriginalConfig(data.config);
      setConfig(JSON.parse(JSON.stringify(data.config)));
      setEtag(data.etag);
      setPreviewOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setPublishing(false);
    }
  };

  if (loading || !config || !originalConfig) {
    return <div>Loading configuration...</div>;
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const getChangesSummary = () => {
    const changes: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(config) as (keyof ManagedRemoteConfig)[]) {
      if (config[key] !== originalConfig[key] && key !== 'config_version') {
        changes[key] = { from: originalConfig[key], to: config[key] };
      }
    }
    return changes;
  };

  const changesSummary = getChangesSummary();
  const isDangerousForceUpdate = 
    (changesSummary.android_min_version && changesSummary.android_min_version.from !== changesSummary.android_min_version.to) ||
    (changesSummary.ios_min_version && changesSummary.ios_min_version.from !== changesSummary.ios_min_version.to) ||
    (changesSummary.force_update_enabled && changesSummary.force_update_enabled.to === true);
    
  const isDangerousMaintenance = changesSummary.maintenance_mode && changesSummary.maintenance_mode.to === true;

  const handleCancel = () => {
    setConfig(JSON.parse(JSON.stringify(originalConfig)));
  };

  return (
    <div className="space-y-6 pb-20">
      
      {hasChanges && (
        <div className="sticky top-0 z-10 bg-amber-500/10 border border-amber-500/20 p-4 rounded-md flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-amber-700 dark:text-amber-400 font-medium">Unsaved changes</p>
          </div>
          <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
            <Button size="sm" onClick={() => setPreviewOpen(true)}>Preview & Publish</Button>
          </div>
        </div>
      )}
      
      <p className="text-sm text-muted-foreground mb-4">
        Current Config Version: {originalConfig.config_version}
      </p>

      {/* APP UPDATE */}
      <Card>
        <CardHeader>
          <CardTitle>App Update</CardTitle>
          <CardDescription>Manage application update requirements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="app_update_enabled">Update System Enabled</Label>
            <Switch 
              id="app_update_enabled"
              checked={config.app_update_enabled} 
              onCheckedChange={(c) => setConfig({...config, app_update_enabled: c})} 
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="force_update_enabled">Force Update Enabled</Label>
            <Switch 
              id="force_update_enabled"
              checked={config.force_update_enabled} 
              onCheckedChange={(c) => setConfig({...config, force_update_enabled: c})} 
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Android</h3>
              <div className="space-y-2">
                <Label>Minimum Version</Label>
                <Input 
                  value={config.android_min_version} 
                  onChange={(e) => setConfig({...config, android_min_version: e.target.value})} 
                  placeholder="1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label>Latest Version</Label>
                <Input 
                  value={config.android_latest_version} 
                  onChange={(e) => setConfig({...config, android_latest_version: e.target.value})} 
                  placeholder="1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label>Play Store URL</Label>
                <Input 
                  value={config.android_store_url} 
                  onChange={(e) => setConfig({...config, android_store_url: e.target.value})} 
                  placeholder="https://play.google.com/..."
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">iOS</h3>
              <div className="space-y-2">
                <Label>Minimum Version</Label>
                <Input 
                  value={config.ios_min_version} 
                  onChange={(e) => setConfig({...config, ios_min_version: e.target.value})} 
                  placeholder="1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label>Latest Version</Label>
                <Input 
                  value={config.ios_latest_version} 
                  onChange={(e) => setConfig({...config, ios_latest_version: e.target.value})} 
                  placeholder="1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label>App Store URL</Label>
                <Input 
                  value={config.ios_store_url} 
                  onChange={(e) => setConfig({...config, ios_store_url: e.target.value})} 
                  placeholder="https://apps.apple.com/..."
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Update Title</Label>
              <Input 
                value={config.update_title} 
                onChange={(e) => setConfig({...config, update_title: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Update Message</Label>
              <Textarea 
                value={config.update_message} 
                onChange={(e) => setConfig({...config, update_message: e.target.value})} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MAINTENANCE MODE */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance Mode</CardTitle>
          <CardDescription>Temporarily block access to the application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between pb-4 border-b">
            <Label htmlFor="maintenance_mode" className="text-red-500 font-semibold">Maintenance Mode</Label>
            <Switch 
              id="maintenance_mode"
              checked={config.maintenance_mode} 
              onCheckedChange={(c) => setConfig({...config, maintenance_mode: c})} 
            />
          </div>
          <div className="space-y-2">
            <Label>Maintenance Title</Label>
            <Input 
              value={config.maintenance_title} 
              onChange={(e) => setConfig({...config, maintenance_title: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <Label>Maintenance Message</Label>
            <Textarea 
              value={config.maintenance_message} 
              onChange={(e) => setConfig({...config, maintenance_message: e.target.value})} 
            />
          </div>
        </CardContent>
      </Card>

      {/* FEATURE FLAGS */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>Enable or disable specific application features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="feature_new_booking_flow">New Booking Flow</Label>
            <Switch 
              id="feature_new_booking_flow"
              checked={config.feature_new_booking_flow} 
              onCheckedChange={(c) => setConfig({...config, feature_new_booking_flow: c})} 
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="feature_training_profile">Training Profile</Label>
            <Switch 
              id="feature_training_profile"
              checked={config.feature_training_profile} 
              onCheckedChange={(c) => setConfig({...config, feature_training_profile: c})} 
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="feature_qr_attendance">QR Attendance</Label>
            <Switch 
              id="feature_qr_attendance"
              checked={config.feature_qr_attendance} 
              onCheckedChange={(c) => setConfig({...config, feature_qr_attendance: c})} 
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="feature_trial_booking">Trial Booking</Label>
            <Switch 
              id="feature_trial_booking"
              checked={config.feature_trial_booking} 
              onCheckedChange={(c) => setConfig({...config, feature_trial_booking: c})} 
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="feature_subscription_booking">Subscription Booking</Label>
            <Switch 
              id="feature_subscription_booking"
              checked={config.feature_subscription_booking} 
              onCheckedChange={(c) => setConfig({...config, feature_subscription_booking: c})} 
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Changes to Publish</DialogTitle>
            <DialogDescription>
              Review your changes before publishing them to live devices.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {Object.keys(changesSummary).length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes detected.</p>
              ) : (
                Object.entries(changesSummary).map(([key, change]) => (
                  <div key={key} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm border-b pb-2">
                    <span className="font-mono truncate" title={key}>{key}</span>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex flex-col text-right">
                      <span className="text-red-500 line-through text-xs truncate">
                        {String(change.from)}
                      </span>
                      <span className="text-green-500 font-medium truncate">
                        {String(change.to)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {isDangerousForceUpdate && (
              <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md text-sm font-medium">
                ⚠️ WARNING: Changing the minimum supported version or enabling force update can immediately block users running older versions from accessing the app.
              </div>
            )}
            
            {isDangerousMaintenance && (
              <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md text-sm font-medium">
                ⚠️ WARNING: Maintenance mode can prevent users from accessing the application.
              </div>
            )}

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={publishing || Object.keys(changesSummary).length === 0}>
              {publishing ? 'Publishing...' : 'Confirm & Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
