"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { httpsCallable } from "firebase/functions";
import { functions, auth } from "@/lib/firebase/config"; // Use shared asia-south1 instance
import { useRouter } from "next/navigation";

interface AdminAttendanceButtonProps {
  bookingId: string;
  sessionId: string;
  status?: string;
}

export function AdminAttendanceButton({ bookingId, sessionId, status }: AdminAttendanceButtonProps) {
  const [isMarking, setIsMarking] = useState(false);
  const router = useRouter();

  if (status === "completed") {
    return <Button variant="outline" size="sm" disabled>Completed</Button>;
  }

  if (status === "cancelled") {
    return <Button variant="outline" size="sm" disabled>Cancelled</Button>;
  }

  const handleMarkAttendance = async () => {
    // --- Diagnostic logging (temporary, for forensic verification) ---
    const currentUser = auth.currentUser;
    console.log("[AdminAttendance] Diagnostic info:", {
      functionName: "adminMarkSessionAttendance",
      region: "asia-south1",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      currentUserUid: currentUser?.uid ?? null,
      currentUserExists: !!currentUser,
      bookingId,
      sessionId,
    });

    try {
      setIsMarking(true);

      if (!currentUser) {
        toast.error("You must be logged in to mark attendance.");
        return;
      }

      // Use the shared functions instance (asia-south1) from config.ts
      const markSessionAttendance = httpsCallable(functions, "adminMarkSessionAttendance");

      const response = await markSessionAttendance({ bookingId, sessionId });
      const data = response.data as { success?: boolean; message?: string; alreadyCompleted?: boolean };

      console.log("[AdminAttendance] Success response:", data);

      if (data?.success) {
        toast.success(data.message || "Attendance Marked Successfully");
        router.refresh();
      } else {
        throw new Error(data?.message || "Failed to mark attendance.");
      }
    } catch (error: unknown) {
      // Log full error details for forensic diagnosis
      const err = error as { code?: string; message?: string; details?: { message?: string }; name?: string; stack?: string };
      console.error("[AdminAttendance] Callable error:", {
        code: err?.code,
        message: err?.message,
        details: err?.details,
        name: err?.name,
        stack: err?.stack,
      });
      const userMsg =
        err?.details?.message ||
        err?.message ||
        "An unexpected error occurred while marking attendance.";
      toast.error(userMsg);
    } finally {
      setIsMarking(false);
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleMarkAttendance} 
      disabled={isMarking}
      title="Mark session attendance from Admin"
    >
      {isMarking ? "Marking..." : "Mark Attendance"}
    </Button>
  );
}
