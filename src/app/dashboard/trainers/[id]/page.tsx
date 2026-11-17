"use client";

import { use, useState, useEffect } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { Trainer } from "@/types";
import { where } from "firebase/firestore";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Globe, Award, CalendarDays, Clock, IndianRupee, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function TrainerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const { data: trainers, isLoading: isTrainerLoading, refetch } = useFirestoreQuery<Trainer>(
    ['trainer', id],
    'trainers',
    [where('__name__', '==', id)]
  );

  const trainer = trainers?.[0];
  const tName = trainer?.name || trainer?.fullName || "Unnamed Trainer";

  // Mutations
  const { update: updateTrainer } = useFirestoreMutation('trainers');

  const handlePauseToggle = async (checked: boolean) => {
    try {
      await updateTrainer.mutateAsync({ id, isPaused: checked });
      toast.success(checked ? "Trainer account paused" : "Trainer account resumed");
      refetch();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleStatusChange = async (newStatus: string | null) => {
    if (!newStatus) return;
    try {
      await updateTrainer.mutateAsync({ id, status: newStatus });
      toast.success(`Trainer status updated to ${newStatus}`);
      refetch();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  if (isTrainerLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!trainer) {
    return <div className="p-6">Trainer not found.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 overflow-x-hidden">
      <Link href="/dashboard/trainers" className={buttonVariants({ variant: "outline", size: "sm", className: "mb-2" })}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Directory
      </Link>

      {/* Header Section */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-muted/50 to-muted h-32 relative">
            <div className="absolute -bottom-12 left-6">
              <Avatar className="h-24 w-24 border-4 border-background shadow-md">
                <AvatarImage src={trainer.photoUrl} alt={tName} />
                <AvatarFallback className="text-3xl">{tName.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div className="pt-16 pb-6 px-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                {tName}
                {trainer.status === "active" && !trainer.isPaused && (
                  <ShieldCheck className="h-6 w-6 text-green-500" />
                )}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span>{trainer.email}</span>
                <span>•</span>
                <span>{trainer.phoneNumber || "No Phone"}</span>
                <span>•</span>
                <span>{trainer.gender || "N/A"}</span>
                <span>•</span>
                <span>{trainer.age ? `${trainer.age} Years` : "N/A"}</span>
                <span>•</span>
                <span className="flex items-center gap-1">⭐ {trainer.rating || 0}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="pause-account" 
                  checked={trainer.isPaused}
                  onCheckedChange={handlePauseToggle}
                />
                <Label htmlFor="pause-account" className="flex flex-col">
                  <span>Pause Account</span>
                  <span className="text-xs text-muted-foreground font-normal">Hides from users</span>
                </Label>
              </div>
              
              <div className="flex flex-col space-y-1">
                <Label className="text-xs">Account Status</Label>
                <Select value={trainer.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="deactivated">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <div className="px-6 pb-6 pt-2 flex gap-2 flex-wrap">
            <Badge variant="outline" className="bg-primary/5">{trainer.tier} Tier</Badge>
            <Badge variant={trainer.status === 'active' ? 'default' : 'secondary'}>
              {trainer.status.charAt(0).toUpperCase() + trainer.status.slice(1)}
            </Badge>
            <Badge variant="outline">{trainer.experienceLevel || "Level N/A"}</Badge>
            {trainer.commissionRate && (
              <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                {trainer.commissionRate}% Commission
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Overview */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bio & Experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {trainer.bio || "No biography provided."}
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Experience</p>
                  <p className="font-medium">{trainer.experienceYears ? `${trainer.experienceYears} Years` : "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Session Length</p>
                  <p className="font-medium">{trainer.sessionDuration ? `${trainer.sessionDuration} mins` : "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Skills & Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><Award className="w-4 h-4" /> Specializations</h4>
                <div className="flex flex-wrap gap-2">
                  {trainer.specialization?.length ? trainer.specialization.map(spec => (
                    <Badge key={spec} variant="secondary" className="text-xs">{spec}</Badge>
                  )) : <span className="text-sm text-muted-foreground">None</span>}
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><Globe className="w-4 h-4" /> Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {trainer.languagesSpoken?.length ? trainer.languagesSpoken.map(lang => (
                    <Badge key={lang} variant="outline" className="text-xs">{lang}</Badge>
                  )) : <span className="text-sm text-muted-foreground">None</span>}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Locations</h4>
                <div className="flex flex-wrap gap-2">
                  {trainer.locations?.length ? trainer.locations.map(loc => (
                    <Badge key={loc} variant="outline" className="text-xs">{loc}</Badge>
                  )) : <span className="text-sm text-muted-foreground">None</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Certifications</CardTitle>
            </CardHeader>
            <CardContent>
              {trainer.certificateUrls?.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {trainer.certificateUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden aspect-video relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Certificate ${i+1}`} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No certificates uploaded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Complex Data */}
        <div className="space-y-6 lg:col-span-2">
          
          {/* Availability */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Working Hours & Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-muted/30 rounded-lg flex items-center gap-4 border">
                <Clock className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Operating Window</p>
                  <p className="text-2xl font-bold">
                    {trainer.startTime || "N/A"} - {trainer.endTime || "N/A"}
                  </p>
                </div>
              </div>

              <h4 className="text-sm font-medium mb-3">Weekly Availability Patterns</h4>
              {trainer.availability && Object.keys(trainer.availability).length > 0 ? (
                <Accordion className="w-full">
                  {Object.entries(trainer.availability).map(([pattern, slots], idx) => (
                    <AccordionItem key={pattern} value={`item-${idx}`}>
                      <AccordionTrigger className="text-sm font-medium">
                        {pattern} ({(slots as string[]).length} slots)
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {(slots as string[]).map((slot: string) => (
                            <Badge key={slot} variant="secondary">{slot}</Badge>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">No specific availability slots mapped.</p>
              )}
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><IndianRupee className="h-5 w-5" /> Pricing & Plans Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="individual" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="individual">Individual Plans</TabsTrigger>
                  <TabsTrigger value="couple">Couple Plans</TabsTrigger>
                  <TabsTrigger value="trial">Trial Pricing</TabsTrigger>
                </TabsList>
                
                <TabsContent value="individual" className="space-y-4">
                  {trainer.pricing && trainer.pricing['1_month'] ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {['1_month', '3_months', '6_months'].map(plan => (
                        trainer.pricing?.[plan] && (
                          <div key={plan} className="p-4 border rounded-lg bg-card shadow-sm">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{plan.replace('_', ' ')}</p>
                            <p className="text-xl font-bold">₹{trainer.pricing[plan]}</p>
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No individual pricing mapped.</p>
                  )}
                </TabsContent>

                <TabsContent value="couple" className="space-y-4">
                  {trainer.couplePricing && trainer.couplePricing['1_month'] ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {['1_month', '3_months', '6_months'].map(plan => (
                        trainer.couplePricing?.[plan] && (
                          <div key={plan} className="p-4 border rounded-lg bg-card shadow-sm">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{plan.replace('_', ' ')}</p>
                            <p className="text-xl font-bold">₹{trainer.couplePricing[plan]}</p>
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No couple pricing mapped.</p>
                  )}
                </TabsContent>

                <TabsContent value="trial" className="space-y-4">
                   {trainer.trialPrice ? (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                        <div className="p-4 border rounded-lg bg-card border-primary/20 shadow-sm">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Individual Trial</p>
                          <p className="text-xl font-bold">₹{trainer.trialPrice?.individual || 0}</p>
                        </div>
                        <div className="p-4 border rounded-lg bg-card border-primary/20 shadow-sm">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Couple Trial</p>
                          <p className="text-xl font-bold">₹{trainer.trialPrice?.couple || 0}</p>
                        </div>
                     </div>
                   ) : (
                     <p className="text-sm text-muted-foreground">No trial pricing mapped.</p>
                   )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
