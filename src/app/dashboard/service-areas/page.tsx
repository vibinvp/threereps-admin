"use client";

import { useState } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Edit2, Trash2 } from "lucide-react";

// Matches exactly what the Flutter app (ServiceArea.fromFirestore) and the
// Cloud Functions booking gate (assertServiceAreaAllowsBooking) read:
// { name, center: { latitude, longitude }, radiusKm, isActive }.
interface ServiceArea {
  id: string;
  name: string;
  center: { latitude: number; longitude: number };
  radiusKm: number;
  isActive: boolean;
}

const serviceAreaSchema = z.object({
  name: z.string().min(1, "Name is required"),
  latitude: z.coerce.number().min(-90).max(90, "Latitude must be between -90 and 90"),
  longitude: z.coerce.number().min(-180).max(180, "Longitude must be between -180 and 180"),
  radiusKm: z.coerce.number().positive("Radius must be greater than 0"),
  isActive: z.boolean(),
});

type ServiceAreaFormValues = z.infer<typeof serviceAreaSchema>;

export default function ServiceAreasPage() {
  const { data: areas, isLoading } = useFirestoreQuery<ServiceArea>(['service_areas'], 'service_areas');
  const { add, update, remove } = useFirestoreMutation('service_areas');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<ServiceArea | null>(null);

  const form = useForm<ServiceAreaFormValues>({
    resolver: zodResolver(serviceAreaSchema) as any,
    defaultValues: { name: "", latitude: 0, longitude: 0, radiusKm: 5, isActive: true },
  });

  const handleOpenModal = (area?: ServiceArea) => {
    if (area) {
      setEditingArea(area);
      form.reset({
        name: area.name,
        latitude: area.center?.latitude ?? 0,
        longitude: area.center?.longitude ?? 0,
        radiusKm: area.radiusKm ?? 5,
        isActive: area.isActive ?? true,
      });
    } else {
      setEditingArea(null);
      form.reset({ name: "", latitude: 0, longitude: 0, radiusKm: 5, isActive: true });
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data: ServiceAreaFormValues) => {
    const payload = {
      name: data.name,
      center: { latitude: data.latitude, longitude: data.longitude },
      radiusKm: data.radiusKm,
      isActive: data.isActive,
    };
    try {
      if (editingArea) {
        await update.mutateAsync({ id: editingArea.id, ...payload });
        toast.success("Service area updated");
      } else {
        await add.mutateAsync(payload);
        toast.success("Service area created");
      }
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Failed to save service area");
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (confirm("Are you sure you want to delete this service area? Users currently relying on it will fall back to the next closest active area.")) {
      try {
        await remove.mutateAsync({ id, soft: false });
        toast.success("Service area deleted");
      } catch (error) {
        toast.error("Failed to delete service area");
      }
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Service Areas Management</h1>
          <p className="text-muted-foreground">
            Geo-fenced areas where 3REPS is available. The app checks a user&apos;s
            location (GPS or manually selected) against these radii to decide
            whether to show trainers, and the booking backend re-validates the
            same check before confirming any booking.
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="mr-2 h-4 w-4" /> Add Service Area
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Center (lat, lng)</TableHead>
                <TableHead>Radius (km)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(areas ?? []).map((area) => (
                <TableRow key={area.id}>
                  <TableCell className="font-medium">{area.name}</TableCell>
                  <TableCell>
                    {area.center?.latitude?.toFixed(5)}, {area.center?.longitude?.toFixed(5)}
                  </TableCell>
                  <TableCell>{area.radiusKm}</TableCell>
                  <TableCell>{area.isActive ? 'Active' : 'Inactive'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenModal(area)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(area.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!areas || areas.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4">No service areas found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Edit Service Area' : 'Add New Service Area'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Bangalore" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" type="number" step="any" {...form.register("latitude")} placeholder="12.9716" />
                {form.formState.errors.latitude && (
                  <p className="text-xs text-destructive">{form.formState.errors.latitude.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" type="number" step="any" {...form.register("longitude")} placeholder="77.5946" />
                {form.formState.errors.longitude && (
                  <p className="text-xs text-destructive">{form.formState.errors.longitude.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="radiusKm">Radius (km)</Label>
              <Input id="radiusKm" type="number" step="any" {...form.register("radiusKm")} placeholder="5" />
              <p className="text-xs text-muted-foreground">
                Users within this distance of the center point are serviceable.
              </p>
              {form.formState.errors.radiusKm && (
                <p className="text-xs text-destructive">{form.formState.errors.radiusKm.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="isActive"
                checked={form.watch("isActive")}
                onCheckedChange={(c) => form.setValue("isActive", c)}
              />
              <Label htmlFor="isActive">Active Status</Label>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button type="button" variant="outline" className="mr-2" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Save Service Area'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
