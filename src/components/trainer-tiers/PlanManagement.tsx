"use client";

import React, { useState } from 'react';
import { useFieldArray, Control, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useQuery } from '@tanstack/react-query';
import { sessionPatternsService, SessionPattern } from '@/lib/services/sessionPatternsService';
import { useAuthStore } from '@/lib/stores/auth-store';
import { sessionPatternSchema } from '@/lib/validations';

interface PlanManagementProps {
  control: Control<any>;
}

// Sub-component for rendering a Duration Table for a specific schedule
function ScheduleDurationTable({ 
  control, 
  planType, 
  schedule 
}: { 
  control: Control<any>, 
  planType: 'individual' | 'couple', 
  schedule: SessionPattern 
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Field path: pricing.subscriptions.individual.mon_wed_fri
  const fieldName = `pricing.subscriptions.${planType}.${schedule.id}`;
  const fieldArray = useFieldArray({ control, name: fieldName });

  const [planFormData, setPlanFormData] = useState({
    title: '',
    durationType: 'months',
    durationValue: 1,
    price: 0,
    active: true,
    popular: false,
    sortOrder: 0
  });

  const handleOpenAdd = () => {
    setPlanFormData({
      title: '',
      durationType: 'months',
      durationValue: 1,
      price: 0,
      active: true,
      popular: false,
      sortOrder: fieldArray.fields.length + 1
    });
    setEditingIndex(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (index: number, plan: any) => {
    setPlanFormData({ ...plan });
    setEditingIndex(index);
    setIsDialogOpen(true);
  };

  const handleDelete = (index: number) => {
    fieldArray.remove(index);
    toast.success('Duration removed');
  };

  const moveUp = (index: number) => {
    if (index > 0) fieldArray.swap(index, index - 1);
  };

  const moveDown = (index: number) => {
    if (index < fieldArray.fields.length - 1) fieldArray.swap(index, index + 1);
  };

  const validatePlan = () => {
    if (!planFormData.title.trim()) {
      toast.error('Title is required');
      return false;
    }
    if (planFormData.price < 0) {
      toast.error('Price cannot be negative');
      return false;
    }
    return true;
  };

  const handleSavePlan = () => {
    if (!validatePlan()) return;
    if (editingIndex !== null) {
      fieldArray.update(editingIndex, planFormData);
      toast.success('Duration updated');
    } else {
      fieldArray.append(planFormData);
      toast.success('Duration added');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={handleOpenAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Add Duration
        </Button>
      </div>
      
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fieldArray.fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                  No durations added for {schedule.displayName}.
                </TableCell>
              </TableRow>
            ) : (
              fieldArray.fields.map((field: any, index: number) => (
                <TableRow key={field.id || index} className={!field.active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveUp(index)} disabled={index === 0}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveDown(index)} disabled={index === fieldArray.fields.length - 1}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {field.title}
                    {field.popular && <Badge variant="secondary" className="ml-2 text-xs">Popular</Badge>}
                  </TableCell>
                  <TableCell>{field.durationValue} {field.durationType}</TableCell>
                  <TableCell>₹{field.price}</TableCell>
                  <TableCell>
                    <Badge variant={field.active ? "default" : "destructive"}>
                      {field.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenEdit(index, field)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? 'Edit Duration' : 'Add New Duration'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input 
                value={planFormData.title} 
                onChange={(e) => setPlanFormData({...planFormData, title: e.target.value})} 
                placeholder="e.g. 1 Month" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration Value</Label>
                <Input 
                  type="number" 
                  min={1} 
                  value={planFormData.durationValue} 
                  onChange={(e) => setPlanFormData({...planFormData, durationValue: parseInt(e.target.value) || 1})} 
                />
              </div>
              <div className="space-y-2">
                <Label>Duration Type</Label>
                <Select value={planFormData.durationType} onValueChange={(val) => val && setPlanFormData({...planFormData, durationType: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="years">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Price (₹)</Label>
              <Input 
                type="number" 
                min={0} 
                value={planFormData.price} 
                onChange={(e) => setPlanFormData({...planFormData, price: parseFloat(e.target.value) || 0})} 
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label>Active Status</Label>
              <Switch checked={planFormData.active} onCheckedChange={(checked) => setPlanFormData({...planFormData, active: checked})} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label>Popular Badge</Label>
              <Switch checked={planFormData.popular} onCheckedChange={(checked) => setPlanFormData({...planFormData, popular: checked})} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSavePlan}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PlanManagement({ control }: PlanManagementProps) {
  const [activeTab, setActiveTab] = useState<'individual' | 'couple'>('individual');
  const [isSeeding, setIsSeeding] = useState(false);
  const { user, adminData, isAuthenticated } = useAuthStore();
  
  const { data: rawPatterns, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['session_patterns'],
    queryFn: async () => {
      console.log('[SESSION_PATTERNS] Loading...');
      const results = await sessionPatternsService.getAll();
      console.log(`[SESSION_PATTERNS] Documents found: ${results.length}`);
      
      if (results.length === 0) {
        console.log('[SESSION_PATTERNS] Collection is empty. Seeding defaults...');
        await sessionPatternsService.seedDefaultPatterns();
        console.log('[SESSION_PATTERNS] Defaults created. Reloading...');
        // Refetch immediately after seeding
        const newResults = await sessionPatternsService.getAll();
        console.log(`[SESSION_PATTERNS] Loaded ${newResults.length} session patterns. Subscriptions ready.`);
        return newResults;
      }
      return results;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 0
  });

  // Log diagnostics when an error occurs
  React.useEffect(() => {
    if (isError && error) {
      const err = error as any;
      console.error('[SESSION_PATTERNS] DIAGNOSTICS LOG');
      console.error('Project:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
      console.error('User:', user?.email || 'Unauthenticated');
      console.error('User UID:', user?.uid || 'N/A');
      console.error('Auth State:', isAuthenticated ? 'Logged In' : 'Logged Out');
      console.error('Is Admin:', adminData?.isActive ? 'Yes' : 'No');
      console.error('Collection:', 'session_patterns');
      console.error('Error Code:', err.code || 'unknown');
      console.error('Error:', err.message);
      console.error('Stack:', err.stack);
    }
  }, [isError, error, user, adminData, isAuthenticated]);

  const patterns = React.useMemo(() => {
    if (!rawPatterns) return [];
    // Validate patterns to ignore invalid ones
    return rawPatterns.filter(pattern => {
      const result = sessionPatternSchema.safeParse(pattern);
      if (!result.success) {
        console.warn(`[SESSION_PATTERNS] Invalid pattern skipped (ID: ${pattern.id}):`, result.error);
        return false;
      }
      return true;
    });
  }, [rawPatterns]);

  const handleManualSeed = async () => {
    setIsSeeding(true);
    try {
      await sessionPatternsService.seedDefaultPatterns();
      toast.success('Default patterns seeded successfully');
      refetch();
    } catch (e: any) {
      toast.error('Failed to seed patterns: ' + e.message);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Trial Pricing Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Trial Pricing (One Session)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Individual Trial</h4>
              <div className="grid gap-4 bg-muted/50 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label>Price (₹)</Label>
                  <Controller
                    name="pricing.trial.individual.price"
                    control={control}
                    render={({ field }) => (
                      <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Controller
                    name="pricing.trial.individual.active"
                    control={control}
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Popular Badge</Label>
                  <Controller
                    name="pricing.trial.individual.popular"
                    control={control}
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Couple Trial</h4>
              <div className="grid gap-4 bg-muted/50 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label>Price (₹)</Label>
                  <Controller
                    name="pricing.trial.couple.price"
                    control={control}
                    render={({ field }) => (
                      <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Controller
                    name="pricing.trial.couple.active"
                    control={control}
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Popular Badge</Label>
                  <Controller
                    name="pricing.trial.couple.popular"
                    control={control}
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">
              Loading session patterns...
            </div>
          ) : isError ? (
            <div className="border border-destructive/50 rounded-lg p-6 bg-destructive/5">
              <h3 className="text-lg font-semibold text-destructive flex items-center mb-4">
                <Wrench className="w-5 h-5 mr-2" /> Developer Diagnostics
              </h3>
              <p className="text-sm mb-4">Unable to load session patterns. Diagnostics:</p>
              
              <ul className="space-y-2 mb-6 font-mono text-sm bg-background p-4 rounded-md border">
                <li className="flex items-center">
                  <span className="w-6 text-green-500">✓</span>
                  <span>User authenticated: {isAuthenticated ? 'Yes' : 'No'} ({user?.email || 'N/A'})</span>
                </li>
                <li className="flex items-center">
                  <span className="w-6 text-green-500">✓</span>
                  <span>User is admin: {adminData?.isActive ? 'Yes' : 'No'}</span>
                </li>
                <li className="flex items-center">
                  <span className="w-6 text-green-500">✓</span>
                  <span>Firebase project: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</span>
                </li>
                <li className="flex items-center">
                  <span className="w-6 text-green-500">✓</span>
                  <span>Collection path: session_patterns</span>
                </li>
                <li className="flex items-center">
                  <span className="w-6 text-green-500">✓</span>
                  <span>Query executed: getDocs(collection(db, "session_patterns"))</span>
                </li>
                <li className="flex items-start text-destructive mt-2 pt-2 border-t">
                  <span className="w-6 shrink-0 mt-0.5">✗</span>
                  <div className="flex flex-col">
                    <span className="font-semibold">Exact failure reason:</span>
                    <span className="whitespace-pre-wrap">{(error as any)?.message}</span>
                    <span className="text-xs text-muted-foreground mt-1">Code: {(error as any)?.code}</span>
                  </div>
                </li>
              </ul>
              
              <div className="flex gap-4">
                <Button onClick={() => refetch()} variant="outline">Retry Query</Button>
                <Button onClick={handleManualSeed} disabled={isSeeding} variant="default">
                  {isSeeding ? 'Forcing Seed...' : 'Force Seed Defaults'}
                </Button>
              </div>
            </div>
          ) : patterns.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">No Session Patterns Found</p>
              <Button onClick={handleManualSeed} disabled={isSeeding}>
                {isSeeding ? 'Adding...' : 'Add Default Patterns'}
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'individual' | 'couple')}>
              <TabsList className="mb-6">
                <TabsTrigger value="individual">Individual Subscriptions</TabsTrigger>
                <TabsTrigger value="couple">Couple Subscriptions</TabsTrigger>
              </TabsList>
              
              {['individual', 'couple'].map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-0 space-y-4">
                  <Accordion className="w-full space-y-2" defaultValue={patterns.map(p => p.id!)}>
                    {patterns.map(pattern => (
                      <AccordionItem key={pattern.id} value={pattern.id!} className="border rounded-lg px-4 bg-card shadow-sm">
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-4">
                            <span className="font-semibold text-base">{pattern.displayName}</span>
                            <Badge variant="secondary">{pattern.daysPerWeek} Days / Week</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-4 pb-6">
                          <ScheduleDurationTable 
                            control={control} 
                            planType={tab as 'individual' | 'couple'} 
                            schedule={pattern} 
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
