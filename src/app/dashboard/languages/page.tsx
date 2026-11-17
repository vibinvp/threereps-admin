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

interface Language {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

const languageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  order: z.coerce.number().int().min(0, "Order must be 0 or greater"),
  isActive: z.boolean(),
});

type LanguageFormValues = z.infer<typeof languageSchema>;

export default function LanguagesPage() {
  const { data: languages, isLoading } = useFirestoreQuery<Language>(['languages'], 'languages');
  const { add, update, remove } = useFirestoreMutation('languages');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState<Language | null>(null);

  const form = useForm<LanguageFormValues>({
    resolver: zodResolver(languageSchema) as any,
    defaultValues: { name: "", order: 0, isActive: true },
  });

  const sortedLanguages = [...(languages ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleOpenModal = (language?: Language) => {
    if (language) {
      setEditingLanguage(language);
      form.reset({
        name: language.name,
        order: language.order ?? 0,
        isActive: language.isActive ?? true,
      });
    } else {
      setEditingLanguage(null);
      form.reset({ name: "", order: (languages?.length ?? 0), isActive: true });
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data: LanguageFormValues) => {
    try {
      if (editingLanguage) {
        await update.mutateAsync({ id: editingLanguage.id, ...data });
        toast.success("Language updated");
      } else {
        await add.mutateAsync(data);
        toast.success("Language created");
      }
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Failed to save language");
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (confirm("Are you sure you want to delete this language?")) {
      try {
        await remove.mutateAsync({ id, soft: false });
        toast.success("Language deleted");
      } catch (error) {
        toast.error("Failed to delete language");
      }
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Languages Management</h1>
          <p className="text-muted-foreground">
            Languages shown for trainer onboarding and the user app&apos;s language filter.
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="mr-2 h-4 w-4" /> Add Language
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
                <TableHead>Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLanguages.map((lang) => (
                <TableRow key={lang.id}>
                  <TableCell>{lang.order ?? 0}</TableCell>
                  <TableCell className="font-medium">{lang.name}</TableCell>
                  <TableCell>{lang.isActive ? 'Active' : 'Inactive'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenModal(lang)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(lang.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!languages || languages.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4">No languages found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingLanguage ? 'Edit Language' : 'Add New Language'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Kannada" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Display Order</Label>
              <Input id="order" type="number" {...form.register("order")} placeholder="0" />
              <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
              {form.formState.errors.order && (
                <p className="text-xs text-destructive">{form.formState.errors.order.message}</p>
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
                {form.formState.isSubmitting ? 'Saving...' : 'Save Language'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
