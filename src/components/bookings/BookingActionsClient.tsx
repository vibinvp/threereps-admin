"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Booking } from "@/app/dashboard/bookings/[id]/page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface FirebaseError extends Error {
  code?: string;
  message: string;
}

function handleFirebaseError(error: any, fallback?: string) {
  console.error("Firebase function error:", error);
  const code = error?.code || "unknown";

  switch (code) {
    case "functions/unauthenticated":
      return "Authentication required.";
    case "functions/permission-denied":
      return "You do not have permission to perform this action.";
    case "functions/not-found":
      return "Booking could not be found.";
    case "functions/already-exists":
      return error?.message || fallback || "This action conflicts with existing data.";
    case "functions/failed-precondition":
      return error?.message || fallback || "This action could not be completed.";
    case "functions/invalid-argument":
      return error?.message || "Invalid input.";
    case "functions/internal":
      return "An internal server error occurred.";
    default:
      return error?.message || fallback || "An unexpected error occurred.";
  }
}

export function AdminNoteForm({ bookingId }: { bookingId: string }) {
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setIsSubmitting(true);
    try {
      const adminAddBookingNote = httpsCallable(functions, "adminAddBookingNote");

      await adminAddBookingNote({ bookingId, note: note.trim() });
      
      toast.success("Note added successfully");
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(handleFirebaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Textarea
        placeholder="Type your note here..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={isSubmitting}
        maxLength={1000}
        className="min-h-[100px]"
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !note.trim()}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            "Add Note"
          )}
        </Button>
      </div>
    </form>
  );
}

export type BookingActionsData = {
  bookingId: string;
  bookingReference: string;
  customerName: string;
  paymentId: string;
  refundAmount: number;
  currency: string;
  refundStatus: string | null;
};

export function RefundRequestModal({ 
  data 
}: { 
  data: BookingActionsData;
}) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const isPendingOrProcessed = data.refundStatus === "pending" || data.refundStatus === "UNKNOWN" || data.refundStatus === "processed";
  
  const handleRefund = async () => {
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const adminRequestRefund = httpsCallable(functions, "adminRequestRefund");

      await adminRequestRefund({ 
        bookingId: data.bookingId, 
        reason: reason.trim() 
      });
      
      toast.success("Refund requested successfully");
      setIsOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(handleFirebaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger 
        render={
          <Button 
            variant="destructive" 
            disabled={!!isPendingOrProcessed}
          >
            Request Refund
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request Refund</DialogTitle>
          <DialogDescription>
            Are you sure you want to request a refund for this payment?
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 border-b pb-2">
            <span className="font-semibold text-gray-500">Booking Ref:</span>
            <span className="col-span-2 font-mono">{data.bookingReference || data.bookingId}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b pb-2">
            <span className="font-semibold text-gray-500">Customer:</span>
            <span className="col-span-2">{data.customerName || "N/A"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b pb-2">
            <span className="font-semibold text-gray-500">Payment ID:</span>
            <span className="col-span-2 font-mono text-xs">{data.paymentId || "N/A"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 border-b pb-2">
            <span className="font-semibold text-gray-500">Amount:</span>
            <span className="col-span-2">{data.refundAmount || 0} {data.currency || "INR"} (subunits)</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="font-semibold text-gray-500 pt-2">Reason:</span>
            <div className="col-span-2">
              <Textarea 
                placeholder="Required for audit..." 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
                className="mt-1"
                maxLength={500}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRefund} disabled={isSubmitting || !reason.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Requesting...
              </>
            ) : (
              "Confirm Refund"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelBookingModal({
  bookingId,
  bookingReference,
  disabled,
}: {
  bookingId: string;
  bookingReference: string;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const adminCancelBooking = httpsCallable(functions, "adminCancelBooking");
      const res = await adminCancelBooking({ bookingId, reason: reason.trim() });
      const data = res.data as { sessionsCancelled?: number };

      toast.success(
        `Booking cancelled${data?.sessionsCancelled ? ` — ${data.sessionsCancelled} remaining session(s) released` : ""}.`
      );
      setIsOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(handleFirebaseError(error, "Could not cancel this booking."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={disabled}>
            Cancel Booking
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cancel Booking</DialogTitle>
          <DialogDescription>
            This cancels {bookingReference || bookingId} and every remaining session, freeing up the trainer&apos;s
            slots. It does not issue a refund — use &quot;Request Refund&quot; separately if one is owed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          <span className="text-sm font-semibold text-gray-500">Reason</span>
          <Textarea
            placeholder="Required for audit..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            maxLength={500}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
            Back
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={isSubmitting || !reason.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              "Confirm Cancellation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type TrainerOption = {
  id: string;
  name: string;
};

export function ChangeTrainerModal({
  bookingId,
  currentTrainerId,
  currentTrainerName,
  trainers,
  disabled,
}: {
  bookingId: string;
  currentTrainerId?: string;
  currentTrainerName?: string;
  trainers: TrainerOption[];
  disabled?: boolean;
}) {
  const [newTrainerId, setNewTrainerId] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const selectableTrainers = trainers.filter((t) => t.id !== currentTrainerId);

  const handleChange = async () => {
    if (!newTrainerId) {
      toast.error("Select a trainer to assign.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const adminChangeTrainer = httpsCallable(functions, "adminChangeTrainer");
      const res = await adminChangeTrainer({ bookingId, newTrainerId, reason: reason.trim() });
      const data = res.data as { sessionsReassigned?: number; newTrainerName?: string };

      toast.success(
        `Reassigned to ${data?.newTrainerName || "new trainer"}${
          data?.sessionsReassigned ? ` — ${data.sessionsReassigned} session(s) moved` : ""
        }.`
      );
      setIsOpen(false);
      setReason("");
      setNewTrainerId("");
      router.refresh();
    } catch (error) {
      toast.error(handleFirebaseError(error, "Could not reassign this booking's trainer."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button variant="secondary" disabled={disabled}>
            Change Trainer
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Trainer</DialogTitle>
          <DialogDescription>
            Reassigns every remaining session from {currentTrainerName || "the current trainer"} to the trainer
            below. The new trainer&apos;s availability is re-checked for every affected slot; if any slot conflicts,
            nothing changes.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-semibold text-gray-500">New Trainer</span>
            <Select value={newTrainerId} onValueChange={(v) => v && setNewTrainerId(v)} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select an active trainer" />
              </SelectTrigger>
              <SelectContent>
                {selectableTrainers.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No other active trainers available
                  </SelectItem>
                ) : (
                  selectableTrainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-semibold text-gray-500">Reason</span>
            <Textarea
              placeholder="Required for audit..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
            Back
          </Button>
          <Button onClick={handleChange} disabled={isSubmitting || !newTrainerId || !reason.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reassigning...
              </>
            ) : (
              "Confirm Reassignment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
