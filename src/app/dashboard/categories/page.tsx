"use client";

import React, { useState } from 'react';
import { useFirestoreQuery } from '@/lib/hooks/useFirestoreQuery';
import { useFirestoreMutation } from '@/lib/hooks/useFirestoreMutation';
import { Category } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { categorySchema } from '@/lib/validations';
import * as z from 'zod';

type CategoryFormValues = z.infer<typeof categorySchema>;

export default function CategoriesPage() {
  const { data: categories, isLoading } = useFirestoreQuery<Category>(['categories'], 'categories');
  const { add, update } = useFirestoreMutation('categories');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema) as any,
    defaultValues: { name: "", description: "", order: 0, isActive: true },
  });

  const sortedCategories = [...(categories ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleOpenAdd = () => {
    form.reset({ name: "", description: "", order: sortedCategories.length, isActive: true });
    setIsAddOpen(true);
  };

  const onSubmit = async (data: CategoryFormValues) => {
    try {
      await add.mutateAsync(data);
      toast.success("Category created");
      setIsAddOpen(false);
    } catch (e) {
      toast.error("Failed to create category");
    }
  };

  const toggleActive = async (cat: Category) => {
    try {
      await update.mutateAsync({ id: cat.id, isActive: !cat.isActive });
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  const moveCategory = async (index: number, direction: -1 | 1) => {
    const target = sortedCategories[index + direction];
    const current = sortedCategories[index];
    if (!target || !current) return;
    try {
      await Promise.all([
        update.mutateAsync({ id: current.id, order: target.order ?? 0 }),
        update.mutateAsync({ id: target.id, order: current.order ?? 0 }),
      ]);
    } catch (e) {
      toast.error("Failed to reorder categories");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Categories Management</h1>
          <p className="text-muted-foreground">
            Existing categories can&apos;t be renamed or deleted since trainers are already
            assigned to them &mdash; you can add new ones, reorder, and enable/disable.
          </p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Category
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
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCategories.map((cat, index) => (
                <TableRow key={cat.id}>
                  <TableCell>{cat.order ?? 0}</TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>{cat.description}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={cat.isActive}
                        onCheckedChange={() => toggleActive(cat)}
                      />
                      <span>{cat.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => moveCategory(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index === sortedCategories.length - 1}
                      onClick={() => moveCategory(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sortedCategories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4">No categories found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Boxing" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" placeholder="Optional" {...form.register("description")} />
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
              <Button type="button" variant="outline" className="mr-2" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Save Category'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
