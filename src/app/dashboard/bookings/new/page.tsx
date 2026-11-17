"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Standalone shape for this manual-override form; mapped onto the real
// bookingSchema document shape (userId/bookingStatus/planSnapshot) on submit.
const formSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  trainerId: z.string().min(1, "Trainer ID is required"),
  status: z.string().min(1, "Status is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  price: z.number().nonnegative(),
});
type BookingFormValues = z.infer<typeof formSchema>;

export default function NewBookingPage() {
  const router = useRouter();
  const { add } = useFirestoreMutation('bookings');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trainerId: "",
      clientId: "",
      status: "pending",
      date: "",
      startTime: "",
      endTime: "",
      price: 0,
    }
  });

  const onSubmit = async (data: BookingFormValues) => {
    setIsSubmitting(true);
    try {
      await add.mutateAsync({
        userId: data.clientId,
        trainerId: data.trainerId,
        bookingStatus: data.status,
        planSnapshot: {
          dayGroup: data.date,
          slotTime: `${data.startTime}-${data.endTime}`,
          price: data.price,
        },
      });
      toast.success("Manual booking created successfully.");
      router.push("/dashboard/bookings");
    } catch (error) {
      toast.error("Failed to create booking override.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href="/dashboard/bookings" className={buttonVariants()}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Bookings
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manual Booking Override</h1>
        <p className="text-muted-foreground">Force a booking creation or adjustment outside normal user flows.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking Details</CardTitle>
          <CardDescription>Enter the precise parameters for this booking assignment.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input id="clientId" placeholder="Enter user document ID" {...form.register("clientId")} />
                {form.formState.errors.clientId && (
                  <span className="text-xs text-red-500">{form.formState.errors.clientId.message}</span>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="trainerId">Trainer ID</Label>
                <Input id="trainerId" placeholder="Enter trainer document ID" {...form.register("trainerId")} />
                {form.formState.errors.trainerId && (
                  <span className="text-xs text-red-500">{form.formState.errors.trainerId.message}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="date">Date (YYYY-MM-DD)</Label>
                <Input id="date" type="date" {...form.register("date")} />
                {form.formState.errors.date && (
                  <span className="text-xs text-red-500">{form.formState.errors.date.message}</span>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time (HH:MM)</Label>
                <Input id="startTime" type="time" {...form.register("startTime")} />
                {form.formState.errors.startTime && (
                  <span className="text-xs text-red-500">{form.formState.errors.startTime.message}</span>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time (HH:MM)</Label>
                <Input id="endTime" type="time" {...form.register("endTime")} />
                {form.formState.errors.endTime && (
                  <span className="text-xs text-red-500">{form.formState.errors.endTime.message}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="price">Price (₹)</Label>
                <Input 
                  id="price" 
                  type="number" 
                  {...form.register("price", { valueAsNumber: true })} 
                />
                {form.formState.errors.price && (
                  <span className="text-xs text-red-500">{form.formState.errors.price.message}</span>
                )}
              </div>
              <div className="space-y-2 flex flex-col">
                <Label className="mb-2">Status</Label>
                <Select
                  onValueChange={(val) => val && form.setValue("status", val)}
                  defaultValue={form.getValues("status")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.status && (
                  <span className="text-xs text-red-500">{form.formState.errors.status.message}</span>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={isSubmitting}>
                <Save className="h-4 w-4 mr-2" /> 
                {isSubmitting ? 'Processing...' : 'Issue Booking Override'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
