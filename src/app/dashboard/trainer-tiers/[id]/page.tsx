"use client";

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trainerTiersService } from '@/lib/services/trainerTiersService';
import { trainerTierSchema } from '@/lib/validations';
import { TrainerTier } from '@/types';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save } from 'lucide-react';
import { TierPreview } from '@/components/trainer-tiers/TierPreview';
import { PlanManagement } from '@/components/trainer-tiers/PlanManagement';
import { sessionPatternsService } from '@/lib/services/sessionPatternsService';
import { Wrench, CheckCircle, Search, Hammer } from 'lucide-react';

export default function EditTrainerTierPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const isNew = params.id === 'new';
  const tierId = params.id as string;

  const { data: initialData, isLoading } = useQuery({
    queryKey: ['trainer_tiers', tierId],
    queryFn: () => trainerTiersService.getTierById(tierId),
    enabled: !isNew,
  });

  const { control, register, handleSubmit, watch, setValue, reset, formState } = useForm<any>({
    resolver: zodResolver(trainerTierSchema) as any,
    defaultValues: {
      name: '',
      position: 0,
      commissionRate: 0,
      isActive: true,
      badgeColor: '#D4AF37',
      badgeTextColor: '#111111',
      borderColor: '#D4AF37',
      gradientStart: '#F7DC6F',
      gradientEnd: '#B8860B',
      icon: 'workspace_premium',
      shortDescription: '',
      pricing: {
        trial: {
          individual: { price: 0, active: true, popular: false, sortOrder: 0 },
          couple: { price: 0, active: true, popular: false, sortOrder: 0 }
        },
        subscriptions: {
          individual: {},
          couple: {}
        }
      }
    } as any,
  });

  const errors = formState.errors as any;

  useEffect(() => {
    if (initialData) {
      // Deep merge with defaults to avoid undefined values leading to NaN
      const mergedData = {
        ...initialData,
        // Legacy documents may still carry a flat `trialPrice` from before the pricing
        // structure was nested; fall back to it when `pricing` itself is absent.
        pricing: initialData.pricing || {
          trial: {
            individual: { price: (initialData as any).trialPrice?.individual || 0, active: true, popular: false, sortOrder: 0 },
            couple: { price: (initialData as any).trialPrice?.couple || 0, active: true, popular: false, sortOrder: 0 }
          },
          subscriptions: {
            individual: {},
            couple: {}
          }
        }
      };
      reset(mergedData);
    } else if (isNew) {
      trainerTiersService.getAllTiers().then(tiers => {
        setValue('position', tiers.length + 1);
      });
    }
  }, [initialData, reset, setValue, isNew]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof trainerTierSchema>) => {
      if (isNew) {
        return trainerTiersService.createTier(values, user?.uid || 'admin');
      } else {
        return trainerTiersService.updateTier(tierId, values, user?.uid || 'admin');
      }
    },
    onSuccess: () => {
      toast.success(isNew ? 'Tier created successfully' : 'Tier updated successfully');
      queryClient.invalidateQueries({ queryKey: ['trainer_tiers'] });
      router.push('/dashboard/trainer-tiers');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save tier');
    }
  });

  const onSubmit = (values: any) => {
    mutation.mutate(values);
  };

  const currentValues = watch();
  const isActive = watch('isActive');

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24">
      <div className="flex items-center space-x-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/trainer-tiers')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <h1 className="text-2xl font-bold">{isNew ? 'Create New Tier' : 'Edit Tier: ' + currentValues.name}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        <div className="xl:col-span-2 space-y-8">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Tier Name *</Label>
                  <Input {...register("name")} placeholder="e.g., Gold" />
                  {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Position *</Label>
                  <Input type="number" {...register("position", { valueAsNumber: true })} />
                  {errors.position && <p className="text-sm text-red-500">{errors.position.message}</p>}
                  <p className="text-sm text-muted-foreground">Determines the order in the list (1 is highest)</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Commission Rate (%)</Label>
                  <Input type="number" {...register("commissionRate", { valueAsNumber: true })} />
                  {errors.commissionRate && <p className="text-sm text-red-500">{errors.commissionRate.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Short Description</Label>
                <Textarea {...register("shortDescription")} placeholder="Perfect for beginners..." rows={2} />
                {errors.shortDescription && <p className="text-sm text-red-500">{errors.shortDescription.message}</p>}
              </div>

              <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Active Status</Label>
                  <p className="text-sm text-muted-foreground">If inactive, it won't be shown to new trainers or users.</p>
                </div>
                <Switch 
                  checked={isActive} 
                  onCheckedChange={(checked) => setValue('isActive', checked)} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance & Styling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Badge Color</Label>
                  <div className="flex space-x-2">
                    <Input type="color" {...register("badgeColor")} className="w-12 h-10 p-1" />
                    <Input {...register("badgeColor")} className="flex-1" placeholder="#000000" />
                  </div>
                  {errors.badgeColor && <p className="text-sm text-red-500">{errors.badgeColor.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Badge Text Color</Label>
                  <div className="flex space-x-2">
                    <Input type="color" {...register("badgeTextColor")} className="w-12 h-10 p-1" />
                    <Input {...register("badgeTextColor")} className="flex-1" />
                  </div>
                  {errors.badgeTextColor && <p className="text-sm text-red-500">{errors.badgeTextColor.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Border Color</Label>
                  <div className="flex space-x-2">
                    <Input type="color" {...register("borderColor")} className="w-12 h-10 p-1" />
                    <Input {...register("borderColor")} className="flex-1" />
                  </div>
                  {errors.borderColor && <p className="text-sm text-red-500">{errors.borderColor.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Gradient Start</Label>
                  <div className="flex space-x-2">
                    <Input type="color" {...register("gradientStart")} className="w-12 h-10 p-1" />
                    <Input {...register("gradientStart")} className="flex-1" />
                  </div>
                  {errors.gradientStart && <p className="text-sm text-red-500">{errors.gradientStart.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Gradient End</Label>
                  <div className="flex space-x-2">
                    <Input type="color" {...register("gradientEnd")} className="w-12 h-10 p-1" />
                    <Input {...register("gradientEnd")} className="flex-1" />
                  </div>
                  {errors.gradientEnd && <p className="text-sm text-red-500">{errors.gradientEnd.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Material Icon Name</Label>
                  <Input {...register("icon")} placeholder="workspace_premium" />
                  {errors.icon && <p className="text-sm text-red-500">{errors.icon.message}</p>}
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Plan Management */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Management</CardTitle>
            </CardHeader>
            <CardContent>
              <PlanManagement control={control} />
            </CardContent>
          </Card>

          {/* Developer Utilities */}
          <Card className="border-dashed border-2">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center">
                <Wrench className="w-5 h-5 mr-2" /> Developer Utilities (Admin Only)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={async () => {
                    toast.loading('Seeding patterns...');
                    await sessionPatternsService.seedDefaultPatterns();
                    queryClient.invalidateQueries({ queryKey: ['session_patterns'] });
                    toast.success('Default session patterns seeded!');
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" /> Seed Default Session Patterns
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={async () => {
                    const patterns = await sessionPatternsService.getAll();
                    toast.info(`Found ${patterns.length} patterns. Validating...`);
                    // Validate logic can go here, handled silently in PlanManagement
                    toast.success('Validation complete (check console for invalid items)');
                  }}
                >
                  <Search className="w-4 h-4 mr-2" /> Validate Session Patterns
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={async () => {
                    toast.loading('Repairing...');
                    await sessionPatternsService.seedDefaultPatterns();
                    queryClient.invalidateQueries({ queryKey: ['session_patterns'] });
                    toast.success('Missing patterns injected!');
                  }}
                >
                  <Hammer className="w-4 h-4 mr-2" /> Repair Missing Session Patterns
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={async () => {
                    const patterns = await sessionPatternsService.getAll();
                    console.log('[DIAGNOSTICS] Raw Session Patterns:', patterns);
                    toast.success(`Logged ${patterns.length} patterns to console.`);
                  }}
                >
                  <Search className="w-4 h-4 mr-2" /> View Session Pattern Diagnostics
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-6">
            <Button type="submit" disabled={mutation.isPending} size="lg">
              <Save className="h-4 w-4 mr-2" />
              {mutation.isPending ? 'Saving...' : 'Save Tier'}
            </Button>
          </div>
        </div>

        {/* Live Preview Sidebar */}
        <div className="xl:col-span-1">
          <div className="sticky top-6">
            <TierPreview values={currentValues} />
          </div>
        </div>

      </form>
    </div>
  );
}
