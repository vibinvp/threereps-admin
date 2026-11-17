"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trainerTiersService } from '@/lib/services/trainerTiersService';
import { TrainerTier } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function TrainerTiersPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<TrainerTier[]>([]);

  const { data: tiers, isLoading } = useQuery<TrainerTier[]>({
    queryKey: ['trainer_tiers'],
    queryFn: () => trainerTiersService.getAllTiers()
  });

  useEffect(() => {
    if (tiers) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local copy for drag reorder
      setItems(tiers);
    }
  }, [tiers]);

  const reorderMutation = useMutation({
    mutationFn: (newTiers: TrainerTier[]) => trainerTiersService.reorderTiers(newTiers, user?.uid || 'admin'),
    onSuccess: () => {
      toast.success('Tiers reordered successfully');
      queryClient.invalidateQueries({ queryKey: ['trainer_tiers'] });
    },
    onError: () => {
      toast.error('Failed to reorder tiers');
      if (tiers) setItems(tiers); // Revert to original
    }
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      const assignedCount = await trainerTiersService.isTierAssignedToTrainers(id);
      if (assignedCount > 0) {
        throw new Error(`Tier is assigned to ${assignedCount} trainers. Please migrate trainers before deletion.`);
      }
      return trainerTiersService.disableTier(id, user?.uid || 'admin');
    },
    onSuccess: () => {
      toast.success('Tier disabled successfully');
      queryClient.invalidateQueries({ queryKey: ['trainer_tiers'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to disable tier');
    }
  });

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[index - 1];
    newItems[index - 1] = temp;
    setItems(newItems);
    reorderMutation.mutate(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[index + 1];
    newItems[index + 1] = temp;
    setItems(newItems);
    reorderMutation.mutate(newItems);
  };

  const handleDisable = (id: string) => {
    if (confirm("Are you sure you want to disable this tier?")) {
      disableMutation.mutate(id);
    }
  };

  const seedMutation = useMutation({
    mutationFn: () => trainerTiersService.seedDefaultTiers(user?.uid || 'admin'),
    onSuccess: () => {
      toast.success('Default tiers seeded successfully');
      queryClient.invalidateQueries({ queryKey: ['trainer_tiers'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to seed tiers');
    }
  });

  const handleSeedTiers = () => {
    if (confirm("Are you sure you want to seed default tiers? This will add Gold, Platinum, and Diamond tiers.")) {
      seedMutation.mutate();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Trainer Tiers</h1>
          <p className="text-muted-foreground">Manage trainer tiers, pricing, and appearance.</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleSeedTiers} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? 'Seeding...' : 'Seed Default Tiers'}
          </Button>
          <Link href="/dashboard/trainer-tiers/new" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" /> Add Tier
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Tier Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial (Ind/Cpl)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((tier, index) => (
                <TableRow key={tier.id}>
                  <TableCell className="space-x-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleMoveDown(index)}
                      disabled={index === items.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: tier.badgeColor || '#000' }}
                      />
                      <span>{tier.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{tier.shortDescription || 'N/A'}</TableCell>
                  <TableCell>{tier.position}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tier.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {tier.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>₹{tier.pricing?.trial?.individual?.price || 0} / ₹{tier.pricing?.trial?.couple?.price || 0}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Link href={`/dashboard/trainer-tiers/${tier.id}`}>
                      <Button variant="outline" size="sm" title="Edit/Preview"><Edit2 className="h-4 w-4" /></Button>
                    </Link>
                    <Button variant="destructive" size="sm" onClick={() => handleDisable(tier.id!)} title="Disable Tier">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4">No tiers found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
