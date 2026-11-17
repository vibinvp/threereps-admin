"use client";

import { use, useState, useEffect } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { useRouter } from "next/navigation";
import { Trainer, TrainerTier } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { where } from "firebase/firestore";

export default function TrainerReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const id = resolvedParams.id;

  const { data: trainers, isLoading } = useFirestoreQuery<Trainer>(
    ['trainer', id],
    'trainers',
    [where('__name__', '==', id)]
  );

  const { data: tiers } = useFirestoreQuery<TrainerTier>(
    ['trainerTiers'],
    'trainer_tiers',
    []
  );

  const { update } = useFirestoreMutation('trainers');
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trainer = trainers?.[0];

  useEffect(() => {
    if (trainer?.tier) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default from fetched trainer
      setSelectedTier(trainer.tier);
    } else if (tiers && tiers.length > 0 && !selectedTier) {
      setSelectedTier(tiers[0].id!);
    }
  }, [trainer, tiers]);

  const handleDecision = async (decision: 'active' | 'rejected') => {
    if (!trainer) return;
    if (decision === 'active' && !selectedTier) {
      toast.error("Please select a tier before approving.");
      return;
    }

    setIsSubmitting(true);
    try {
      await update.mutateAsync({
        id: trainer.id,
        status: decision,
        ...(decision === 'active' && { tier: selectedTier })
      });
      toast.success(`Trainer has been ${decision === 'active' ? 'approved' : 'rejected'}`);
      router.push('/dashboard/trainers/applications');
    } catch (error) {
      toast.error("Failed to process decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!trainer) {
    return <div className="p-6">Trainer not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/dashboard/trainers/applications" className={buttonVariants()}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Applications
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Application</h1>
          <p className="text-muted-foreground">Inspect details and assign a tier to approve.</p>
        </div>
        <Badge variant={trainer.status === 'pending' || trainer.status === 'new' ? 'secondary' : 'default'} className="text-sm px-3 py-1">
          {trainer.status.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={trainer.photoUrl} />
                <AvatarFallback className="text-3xl">{trainer.fullName?.charAt(0) || 'T'}</AvatarFallback>
              </Avatar>
              <div className="text-center">
                <CardTitle>{trainer.fullName}</CardTitle>
                <CardDescription>{trainer.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-xs text-muted-foreground">Phone</span>
              <p className="font-medium text-sm">{trainer.phoneNumber || 'N/A'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Gender & Age</span>
              <p className="font-medium text-sm">{trainer.gender}, {trainer.age} years old</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Experience</span>
              <p className="font-medium text-sm">{trainer.experienceYears} Years - {trainer.experienceLevel}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>Professional Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-grow">
            <div>
              <h3 className="text-sm font-medium mb-2">Bio</h3>
              <p className="text-sm text-muted-foreground bg-muted p-4 rounded-md">
                {trainer.bio || 'No biography provided.'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Specializations</h3>
              <div className="flex flex-wrap gap-2">
                {trainer.specialization?.map(spec => (
                  <Badge key={spec} variant="outline">{spec}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Decision & Tier Assignment</CardTitle>
            <CardDescription>Select a commission tier and finalize the application.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-6 items-center">
            <div className="w-full sm:w-1/2 space-y-2">
              <label className="text-sm font-medium">Assign Tier</label>
              <Select value={selectedTier} onValueChange={v => setSelectedTier(v as string)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers?.map(tier => (
                    <SelectItem key={tier.id} value={tier.id!}>
                      {tier.name} ({tier.commissionRate}% Commission)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-4 w-full sm:w-auto mt-4 sm:mt-6">
              <Button 
                variant="destructive" 
                className="w-full sm:w-auto"
                disabled={isSubmitting}
                onClick={() => handleDecision('rejected')}
              >
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
              <Button 
                variant="default" 
                className="w-full sm:w-auto"
                disabled={isSubmitting}
                onClick={() => handleDecision('active')}
              >
                <CheckCircle className="h-4 w-4 mr-2" /> Approve & Assign Tier
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
