"use client";

import { useState } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { Image as ImageIcon, Plus } from "lucide-react";

// Field names below must match threereps_user's BannerModel.fromFirestore
// (lib/features/home/data/models/banner_model.dart), which is the sole
// reader of the `banners` collection in the client app.
interface Banner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  actionType: "trainer" | "plans" | "external";
  actionValue: string;
  isActive: boolean;
  order: number;
  createdAt?: any;
}

const bannerSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subtitle: z.string().default(""),
  actionType: z.enum(["trainer", "plans", "external"]),
  actionValue: z.string().default(""),
  order: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.actionType === "external" && data.actionValue.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["actionValue"],
      message: "A URL is required for the External link action",
    });
  }
});

type BannerFormValues = z.infer<typeof bannerSchema>;

const ACTION_TYPE_LABELS: Record<Banner["actionType"], string> = {
  trainer: "Open trainer",
  plans: "Open plans",
  external: "External link",
};

function actionValueHelp(actionType: Banner["actionType"]) {
  switch (actionType) {
    case "trainer":
      return "Optional trainer ID to open a specific trainer's profile. Leave empty to open the Trainers list.";
    case "plans":
      return "Not used for the Plans action — leave empty.";
    case "external":
      return "Full URL to open, e.g. https://example.com";
  }
}

export default function BannersPage() {
  const { data: banners, isLoading } = useFirestoreQuery<Banner>(['banners'], 'banners');
  const { add, update } = useFirestoreMutation('banners');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<BannerFormValues>({
    resolver: zodResolver(bannerSchema) as any,
    defaultValues: {
      title: "",
      subtitle: "",
      actionType: "trainer",
      actionValue: "",
      order: 0,
      isActive: true,
    },
  });

  const actionType = form.watch("actionType");

  const handleOpenModal = (banner?: Banner) => {
    if (banner) {
      setEditingBanner(banner);
      form.reset({
        title: banner.title,
        subtitle: banner.subtitle || "",
        actionType: banner.actionType || "trainer",
        actionValue: banner.actionValue || "",
        order: banner.order ?? 0,
        isActive: banner.isActive,
      });
    } else {
      setEditingBanner(null);
      form.reset({
        title: "",
        subtitle: "",
        actionType: "trainer",
        actionValue: "",
        order: (banners?.length ?? 0),
        isActive: true,
      });
    }
    setSelectedFile(null);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (banner: Banner, checked: boolean) => {
    try {
      await update.mutateAsync({ id: banner.id, isActive: checked });
      toast.success(`Banner is now ${checked ? 'active' : 'inactive'}`);
    } catch (error) {
      toast.error("Failed to update banner status");
    }
  };

  const onSubmit = async (data: BannerFormValues) => {
    try {
      let imageUrl = editingBanner?.imageUrl || "";

      if (selectedFile) {
        setUploadingImage(true);
        const fileRef = ref(storage, `banners/${Date.now()}_${selectedFile.name}`);
        await uploadBytes(fileRef, selectedFile);
        imageUrl = await getDownloadURL(fileRef);
        setUploadingImage(false);
      } else if (!editingBanner) {
        toast.error("Please select an image");
        return;
      }

      if (editingBanner) {
        await update.mutateAsync({ id: editingBanner.id, ...data, imageUrl });
        toast.success("Banner updated successfully");
      } else {
        await add.mutateAsync({ ...data, imageUrl });
        toast.success("Banner created successfully");
      }

      setIsModalOpen(false);
    } catch (error) {
      setUploadingImage(false);
      toast.error("Failed to save banner");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 overflow-hidden">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Banner Management</h1>
          <p className="text-muted-foreground">Manage app promotional banners and placements.</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="mr-2 h-4 w-4" /> Add Banner
        </Button>
      </div>

      {/*
        The user app's carousel (_PromoBannerCarousel in home_screen.dart)
        renders each banner at a fixed 180px height, full screen width minus
        a 16px margin on each side, with BoxFit.cover. Across typical phone
        widths (360-430px) that works out to roughly a 2:1 width:height
        crop — hence the recommendation below and the 2:1 preview frame.
      */}
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Recommended banner size: </span>
        1200 × 600px (2:1 aspect ratio). The app crops banners to fill a 2:1
        frame with no letterboxing, so keep important text/subjects centered —
        the left/right edges may be trimmed on narrower phones.
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banners?.map((banner) => (
            <Card key={banner.id} className="overflow-hidden flex flex-col">
              {/* 2:1 to match the app's actual crop — see the note above. */}
              <div className="aspect-[2/1] relative bg-muted">
                {banner.imageUrl ? (
                  <img src={banner.imageUrl} alt={banner.title} className="object-cover w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10 opacity-50" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                    #{banner.order ?? 0}
                  </span>
                  <span className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                    {ACTION_TYPE_LABELS[banner.actionType] ?? banner.actionType}
                  </span>
                </div>
              </div>
              <CardHeader className="py-4">
                <CardTitle className="text-lg">{banner.title}</CardTitle>
                {banner.subtitle && (
                  <p className="text-sm text-muted-foreground truncate">{banner.subtitle}</p>
                )}
                {banner.actionValue && (
                  <p className="text-sm text-muted-foreground truncate" title={banner.actionValue}>
                    Target: {banner.actionValue}
                  </p>
                )}
              </CardHeader>
              <CardFooter className="flex justify-between items-center py-4 mt-auto border-t bg-muted/20">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={banner.isActive}
                    onCheckedChange={(c) => handleToggleActive(banner, c)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {banner.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleOpenModal(banner)}>
                  Edit
                </Button>
              </CardFooter>
            </Card>
          ))}
          {banners?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              No banners found. Create one to get started.
            </div>
          )}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="image">Banner Image</Label>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Recommended size: 1200 × 600px (2:1 ratio) — will be cropped to fill, not letterboxed.
              </p>
              {editingBanner && !selectedFile && (
                <p className="text-xs text-muted-foreground">Leave empty to keep current image</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Promotion Title</Label>
              <Input id="title" {...form.register("title")} />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input id="subtitle" {...form.register("subtitle")} placeholder="e.g. Transform your fitness journey today" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionType">Tap Action</Label>
              <Select
                value={actionType}
                onValueChange={(v) => form.setValue("actionType", v as Banner["actionType"])}
              >
                <SelectTrigger id="actionType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trainer">Open trainer</SelectItem>
                  <SelectItem value="plans">Open plans</SelectItem>
                  <SelectItem value="external">External link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionValue">
                {actionType === "external" ? "URL" : "Trainer ID (optional)"}
              </Label>
              <Input
                id="actionValue"
                {...form.register("actionValue")}
                placeholder={actionType === "external" ? "https://..." : "Firestore trainer document ID"}
                disabled={actionType === "plans"}
              />
              <p className="text-xs text-muted-foreground">{actionValueHelp(actionType)}</p>
              {form.formState.errors.actionValue && (
                <p className="text-xs text-destructive">{form.formState.errors.actionValue.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Display Order</Label>
              <Input id="order" type="number" {...form.register("order")} placeholder="0" />
              <p className="text-xs text-muted-foreground">Lower numbers appear first in the carousel.</p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="isActive"
                checked={form.watch("isActive")}
                onCheckedChange={(c) => form.setValue("isActive", c)}
              />
              <Label htmlFor="isActive">Active Status</Label>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="button" variant="outline" className="mr-2" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || uploadingImage}>
                {form.formState.isSubmitting || uploadingImage ? 'Saving...' : 'Save Banner'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
