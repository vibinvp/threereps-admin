"use client";

import { use, useState, useEffect } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { resolveTrainerTierName } from "@/lib/utils/tier";
import { Trainer } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, X, Plus, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { where, documentId } from "firebase/firestore";
import Image from "next/image";
import { ProfileImageEditor, CertificatesEditor } from "./image-editors";

// ==========================================
// CONSTANTS & ALLOWLIST
// ==========================================
const EDITABLE_FIELDS = [
  "name",
  "email",
  "phoneNumber",
  "age",
  "gender",
  "bio",
  "experienceYears",
  "experienceLevel",
  "sessionDuration",
  "commissionRate",
  "specialization",
  "languagesSpoken",
  "locations",
  "availability",
  "pricing",
  "couplePricing",
  "trialPrice",
  "tier",
] as const;

// ==========================================
// SUB-COMPONENTS
// ==========================================

function ArrayEditor({ items, onChange, placeholder }: { items: string[], onChange: (items: string[]) => void, placeholder: string }) {
  const [input, setInput] = useState("");
  const safeItems = Array.isArray(items) ? items : [];

  const add = () => {
    if (input.trim() && !safeItems.includes(input.trim())) {
      onChange([...safeItems, input.trim()]);
      setInput("");
    }
  };

  const remove = (idx: number) => {
    const newItems = [...safeItems];
    newItems.splice(idx, 1);
    onChange(newItems);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 mb-2">
        {safeItems.map((item, idx) => (
          <Badge key={idx} variant="secondary" className="flex items-center gap-1">
            {item}
            <button type="button" onClick={() => remove(idx)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="max-w-[200px]"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}

function AvailabilityEditor({ availability, onChange }: { availability: Record<string, string[]>, onChange: (val: Record<string, string[]>) => void }) {
  const [newPattern, setNewPattern] = useState("");
  const [newTime, setNewTime] = useState("");
  const [selectedPattern, setSelectedPattern] = useState("");

  const safeAvailability = availability || {};

  const removeSlot = (pattern: string, idx: number) => {
    const updated = { ...safeAvailability };
    updated[pattern] = [...updated[pattern]];
    updated[pattern].splice(idx, 1);
    if (updated[pattern].length === 0) {
      delete updated[pattern];
    }
    onChange(updated);
  };

  const addSlot = () => {
    if (!selectedPattern || !newTime) return;
    const updated = { ...safeAvailability };
    if (!updated[selectedPattern]) updated[selectedPattern] = [];
    if (!updated[selectedPattern].includes(newTime)) {
      updated[selectedPattern] = [...updated[selectedPattern], newTime];
      // Sort times roughly
      updated[selectedPattern].sort((a, b) => {
        const getVal = (t: string) => {
          const ampm = t.includes('PM') ? 12 : 0;
          let hr = parseInt(t) || 0;
          if (hr === 12) hr = 0;
          return hr + ampm;
        };
        return getVal(a) - getVal(b);
      });
    }
    onChange(updated);
    setNewTime("");
  };

  const addPattern = () => {
    if (newPattern && !safeAvailability[newPattern]) {
      const updated = { ...safeAvailability };
      updated[newPattern] = [];
      onChange(updated);
      setSelectedPattern(newPattern);
      setNewPattern("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.keys(safeAvailability).map((pattern) => (
          <div key={pattern} className="border rounded-md p-4 bg-muted/20">
            <h4 className="font-medium mb-3 flex items-center justify-between">
              {pattern}
              <button 
                type="button"
                onClick={() => {
                  const updated = { ...safeAvailability };
                  delete updated[pattern];
                  onChange(updated);
                  if (selectedPattern === pattern) setSelectedPattern("");
                }}
                className="text-destructive text-sm flex items-center"
              >
                <X className="h-3 w-3 mr-1"/> Remove Pattern
              </button>
            </h4>
            <div className="flex flex-wrap gap-2">
              {safeAvailability[pattern].map((time, idx) => (
                <Badge key={idx} variant="outline" className="bg-background flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {time}
                  <button type="button" onClick={() => removeSlot(pattern, idx)} className="text-muted-foreground hover:text-foreground ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {safeAvailability[pattern].length === 0 && (
                <span className="text-xs text-muted-foreground italic">No time slots</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 p-4 border rounded-md bg-muted/10">
        <div className="space-y-2">
          <Label>Pattern</Label>
          <div className="flex items-center gap-2">
            <select 
              className="flex h-9 w-[150px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedPattern}
              onChange={(e) => setSelectedPattern(e.target.value)}
            >
              <option value="" disabled>Select pattern</option>
              {Object.keys(safeAvailability).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Time Slot</Label>
          <Input 
            placeholder="e.g. 4 AM" 
            value={newTime} 
            onChange={e => setNewTime(e.target.value)} 
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSlot(); } }}
            className="w-[120px]"
          />
        </div>
        <Button type="button" variant="secondary" onClick={addSlot} disabled={!selectedPattern || !newTime}>
          Add Slot
        </Button>
        <div className="w-px h-8 bg-border mx-2"></div>
        <div className="flex items-center gap-2">
          <Input 
            placeholder="New pattern (e.g. Mon-Fri)" 
            value={newPattern} 
            onChange={e => setNewPattern(e.target.value)}
            className="w-[180px]"
          />
          <Button type="button" variant="outline" onClick={addPattern} disabled={!newPattern}>
            New Pattern
          </Button>
        </div>
      </div>
    </div>
  );
}

function PricingEditor({ pricing, onChange, title }: { pricing: any, onChange: (val: any) => void, title: string }) {
  const safePricing = pricing || {};
  const rootKeys = ['3_days', '6_days'];
  const durations = ['15_days', '1_month', '3_month', '6_month', '1_year'];

  const updatePrice = (root: string, duration: string, value: string) => {
    const updated = { ...safePricing };
    if (!updated[root]) updated[root] = {};
    const parsed = parseInt(value);
    updated[root][duration] = isNaN(parsed) ? 0 : parsed;
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rootKeys.map(root => (
          <div key={root} className="space-y-3">
            <h4 className="font-medium text-muted-foreground capitalize">{root.replace('_', ' ')}</h4>
            <div className="space-y-2">
              {durations.map(dur => (
                <div key={dur} className="flex items-center justify-between gap-4">
                  <Label className="text-xs font-normal w-24">{dur.replace('_', ' ')}</Label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input 
                      type="number"
                      className="pl-7"
                      value={safePricing[root]?.[dur] ?? ""}
                      onChange={(e) => updatePrice(root, dur, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function TrainerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const id = resolvedParams.id;

  const { data: trainers, isLoading } = useFirestoreQuery<Trainer>(
    ['trainers', id],
    'trainers',
    [where(documentId(), '==', id)]
  );

  const { data: tiers } = useFirestoreQuery<any>(
    ['trainerTiers'],
    'trainer_tiers',
    []
  );

  const queryClient = useQueryClient();
  const { update } = useFirestoreMutation('trainers');
  
  const [formData, setFormData] = useState<Partial<Trainer>>({});
  const [originalData, setOriginalData] = useState<Trainer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (trainers?.[0]) {
      const t = trainers[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOriginalData(t);
      
      if (!isInitialized) {
        // Canonical normalization
        const normalized: Partial<Trainer> = {
          name: t.name || t.fullName || "",
          email: t.email ?? "",
          phoneNumber: t.phoneNumber ?? "",
          age: t.age ?? "",
          gender: t.gender ?? "",
          bio: t.bio ?? "",
          experienceYears: t.experienceYears ?? "",
          experienceLevel: t.experienceLevel ?? "",
          sessionDuration: t.sessionDuration ?? "",
          commissionRate: t.commissionRate ?? "",
          specialization: Array.isArray(t.specialization) ? t.specialization : [],
          languagesSpoken: Array.isArray(t.languagesSpoken) ? t.languagesSpoken : [],
          locations: Array.isArray(t.locations) ? t.locations : [],
          availability: t.availability || {},
          pricing: t.pricing || {},
          couplePricing: t.couplePricing || {},
          trialPrice: t.trialPrice || { individual: 0, couple: 0 },
          tier: t.tier || "Standard",
        };
        
        setFormData(normalized);
        setIsInitialized(true);
      }
    }
  }, [trainers, isInitialized]);

  const handleChange = (field: keyof Trainer, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    // Check if there are changes
    const isDirty = JSON.stringify(formData) !== JSON.stringify({
      name: originalData?.name || originalData?.fullName || "",
      email: originalData?.email ?? "",
      phoneNumber: originalData?.phoneNumber ?? "",
      age: originalData?.age ?? "",
      gender: originalData?.gender ?? "",
      bio: originalData?.bio ?? "",
      experienceYears: originalData?.experienceYears ?? "",
      experienceLevel: originalData?.experienceLevel ?? "",
      sessionDuration: originalData?.sessionDuration ?? "",
      commissionRate: originalData?.commissionRate ?? "",
      specialization: Array.isArray(originalData?.specialization) ? originalData?.specialization : [],
      languagesSpoken: Array.isArray(originalData?.languagesSpoken) ? originalData?.languagesSpoken : [],
      locations: Array.isArray(originalData?.locations) ? originalData?.locations : [],
      availability: originalData?.availability || {},
      pricing: originalData?.pricing || {},
      couplePricing: originalData?.couplePricing || {},
      trialPrice: originalData?.trialPrice || { individual: 0, couple: 0 },
      tier: originalData?.tier || "Standard",
    });

    if (isDirty) {
      if (!window.confirm("You have unsaved changes.\n\nDiscard changes?")) {
        return;
      }
    }
    router.back();
  };

  const handleSave = async () => {
    if (!originalData) return;
    setIsSubmitting(true);
    
    // Construct exact partial update payload
    const updatePayload: any = { id: originalData.id };
    let hasChanges = false;
    
    EDITABLE_FIELDS.forEach(field => {
      let formVal: any = formData[field as keyof Trainer];
      let origVal: any = (originalData as any)[field];

      // Align origVal with form initialization for clean comparison
      if (field === 'name') origVal = originalData.name || originalData.fullName || "";
      if (field === 'trialPrice') origVal = originalData.trialPrice || { individual: 0, couple: 0 };
      if (field === 'availability') origVal = originalData.availability || {};
      if (field === 'pricing') origVal = originalData.pricing || {};
      if (field === 'couplePricing') origVal = originalData.couplePricing || {};
      if (field === 'email') origVal = origVal ?? "";
      if (field === 'phoneNumber') origVal = origVal ?? "";
      if (field === 'gender') origVal = origVal ?? "";
      if (field === 'bio') origVal = origVal ?? "";
      if (field === 'experienceLevel') origVal = origVal ?? "";
      if (field === 'tier') origVal = origVal || "Standard";
      
      if (['specialization', 'languagesSpoken', 'locations'].includes(field)) {
        origVal = Array.isArray(origVal) ? origVal : [];
      }

      // Convert numerics correctly for comparison
      if (['age', 'experienceYears', 'sessionDuration', 'commissionRate'].includes(field)) {
        formVal = (formVal === "" || formVal === null || formVal === undefined) ? null : Number(formVal);
        origVal = (origVal === "" || origVal === null || origVal === undefined) ? null : Number(origVal);
      }

      // Special handling for pricing, ensure 0 is not lost
      if (['pricing', 'couplePricing', 'trialPrice', 'availability'].includes(field)) {
        // Simple stringify comparison is fine, we just want to avoid undefined/null issues
        if (formVal === undefined) formVal = {};
        if (origVal === undefined) origVal = {};
      }

      // Deep compare
      const isDirty = JSON.stringify(formVal) !== JSON.stringify(origVal);
      
      if (isDirty) {
        updatePayload[field] = formVal;
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      toast.info("No changes to save");
      setIsSubmitting(false);
      return;
    }

    updatePayload.updatedAt = new Date();

    try {
      await update.mutateAsync(updatePayload);
      toast.success('Trainer updated successfully');
      setIsInitialized(false); // Trigger form re-initialization with fresh data
    } catch (error) {
      console.error("Update failed", error);
      toast.error("Failed to update trainer");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !isInitialized) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!originalData) {
    return <div className="p-6">Trainer not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Trainer</h1>
            <p className="text-muted-foreground">Modify trainer details carefully.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            <Save className="h-4 w-4 mr-2" /> {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* PERSONAL INFORMATION */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="mb-6 pb-6 border-b">
              <Label className="mb-4 block font-semibold text-base">Profile Photo</Label>
              <ProfileImageEditor 
                trainerId={id as string} 
                currentPhotoUrl={originalData.photoUrl} 
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
              <Label>Name (Canonical)</Label>
              <Input value={formData.name as string ?? ""} onChange={e => handleChange('name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email as string ?? ""} onChange={e => handleChange('email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={formData.phoneNumber as string ?? ""} onChange={e => handleChange('phoneNumber', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input type="number" value={formData.age as number ?? ""} onChange={e => handleChange('age', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Input value={formData.gender as string ?? ""} onChange={e => handleChange('gender', e.target.value)} />
            </div>
            </div>
          </CardContent>
        </Card>

        {/* PROFESSIONAL INFORMATION */}
        <Card>
          <CardHeader>
            <CardTitle>Professional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select 
                  value={formData.tier as string ?? "Standard"} 
                  onValueChange={v => handleChange('tier', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    {tiers && tiers.map((tier: any) => (
                      <SelectItem key={tier.id} value={tier.name}>{tier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Experience Years</Label>
                <Input type="number" value={formData.experienceYears as number ?? ""} onChange={e => handleChange('experienceYears', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Experience Level</Label>
                <Input value={formData.experienceLevel as string ?? ""} onChange={e => handleChange('experienceLevel', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Session Duration (minutes)</Label>
                <Input type="number" value={formData.sessionDuration as number ?? ""} onChange={e => handleChange('sessionDuration', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Commission Rate (%)</Label>
                <Input type="number" value={formData.commissionRate as number ?? ""} onChange={e => handleChange('commissionRate', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea rows={4} value={formData.bio as string ?? ""} onChange={e => handleChange('bio', e.target.value)} />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div>
                <Label className="mb-2 block font-semibold text-base">Specializations</Label>
                <ArrayEditor 
                  items={(formData.specialization as string[]) || []} 
                  onChange={v => handleChange('specialization', v)} 
                  placeholder="e.g. Yoga" 
                />
              </div>
              <div className="pt-2">
                <Label className="mb-2 block font-semibold text-base">Languages Spoken</Label>
                <ArrayEditor 
                  items={(formData.languagesSpoken as string[]) || []} 
                  onChange={v => handleChange('languagesSpoken', v)} 
                  placeholder="e.g. English" 
                />
              </div>
              <div className="pt-2">
                <Label className="mb-2 block font-semibold text-base">Locations</Label>
                <ArrayEditor 
                  items={(formData.locations as string[]) || []} 
                  onChange={v => handleChange('locations', v)} 
                  placeholder="e.g. Downtown" 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CERTIFICATES */}
        <Card>
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
            <CardDescription>Manage the trainer's uploaded certificates.</CardDescription>
          </CardHeader>
          <CardContent>
            <CertificatesEditor 
              trainerId={id as string} 
              currentCertificates={originalData.certificateUrls || []} 
            />
          </CardContent>
        </Card>

        {/* AVAILABILITY */}
        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>Manage session patterns and time slots exactly as the Trainer App expects.</CardDescription>
          </CardHeader>
          <CardContent>
            <AvailabilityEditor 
              availability={(formData.availability as Record<string, string[]>) || {}}
              onChange={v => handleChange('availability', v)}
            />
          </CardContent>
        </Card>

        {/* PRICING */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>Manage structured plans for Individual and Couple categories.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <PricingEditor 
              title="Individual Pricing"
              pricing={formData.pricing}
              onChange={v => handleChange('pricing', v)}
            />
            <div className="border-t pt-8">
              <PricingEditor 
                title="Couple Pricing"
                pricing={formData.couplePricing}
                onChange={v => handleChange('couplePricing', v)}
              />
            </div>
            <div className="border-t pt-8">
              <h3 className="font-semibold text-sm mb-4">Trial Pricing</h3>
              <div className="flex gap-6 max-w-md">
                <div className="space-y-2 flex-1">
                  <Label>Individual Trial</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input 
                      type="number"
                      className="pl-7"
                      value={(formData.trialPrice as any)?.individual ?? ""}
                      onChange={(e) => handleChange('trialPrice', { ...formData.trialPrice as any, individual: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  <Label>Couple Trial</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input 
                      type="number"
                      className="pl-7"
                      value={(formData.trialPrice as any)?.couple ?? ""}
                      onChange={(e) => handleChange('trialPrice', { ...formData.trialPrice as any, couple: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* READ-ONLY MEDIA & METADATA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Photo & Certificates</CardTitle>
              <CardDescription>These are preserved automatically when saving.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Current Profile Photo</Label>
                {originalData.photoUrl ? (
                  <div className="relative h-24 w-24 rounded-md overflow-hidden border">
                    <Image 
                      src={originalData.photoUrl} 
                      alt="Profile" 
                      fill 
                      className="object-cover" 
                      unoptimized // Because it's an external firebase url
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No photo uploaded.</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Certificates</Label>
                {originalData.certificateUrls && originalData.certificateUrls.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {originalData.certificateUrls.map((url, i) => (
                      <a 
                        key={i} 
                        href={url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm text-primary flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3"/> Certificate {i + 1}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No certificates uploaded.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Read-Only Metadata</CardTitle>
              <CardDescription>System-managed trainer status and timestamps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">UID</span>
                <span className="font-mono">{originalData.uid}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={originalData.status === 'active' ? 'default' : 'secondary'}>
                  {originalData.status || 'unknown'}
                </Badge>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-medium">{resolveTrainerTierName(originalData.tier, tiers) || 'Standard'}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Rating</span>
                <span className="font-medium">{originalData.rating || 0}</span>
              </div>
              {originalData.createdAt && (
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">Created At</span>
                  <span>{new Date(originalData.createdAt.seconds * 1000 || originalData.createdAt).toLocaleDateString()}</span>
                </div>
              )}
              {originalData.joinedDate && (
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">Joined</span>
                  <span>{new Date(originalData.joinedDate.seconds * 1000 || originalData.joinedDate).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
