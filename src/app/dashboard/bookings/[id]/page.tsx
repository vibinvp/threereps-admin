import { getAdminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import { AlertCircle, ChevronLeft, Search } from "lucide-react";
import { Timestamp } from "firebase-admin/firestore";
import { AdminNoteForm, RefundRequestModal, CancelBookingModal, ChangeTrainerModal, TrainerOption } from "@/components/bookings/BookingActionsClient";
import { AdminAttendanceButton } from "@/components/AdminAttendanceButton";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// --- Types matching the actual Firestore schema ---

export interface RefundQueueState {
  status: string;
}

export interface PricingBreakdown {
  finalAmount?: number;
  originalAmount?: number;
  discountAmount?: number;
  couponAmount?: number;
  taxAmount?: number;
  taxPercentage?: number;
  currency?: string;
}

export interface Progress {
  totalSessions?: number;
  completedSessions?: number;
  remainingSessions?: number;
}

export interface UserSnapshot {
  name?: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
}

export interface TrainerSnapshot {
  name?: string;
  trainerName?: string;
}

export interface TierSnapshot {
  name?: string;
  tierName?: string;
}

export interface PaymentSnapshot {
  amount?: number;
  gateway?: string;
  status?: string;
  paidAt?: string | null;
}

export interface PlanSnapshot {
  name?: string;
  title?: string;
  scheduleName?: string;
}
export interface SessionSnapshot {
  slotDate?: string;
  slotTime?: string;
  timezone?: string;
  status?: string;
}

export interface Booking {
  id: string;
  bookingReference?: string;
  orderId?: string;
  paymentId?: string;
  userId?: string;
  trainerId?: string;
  status?: string;
  bookingStatus?: string;
  paymentStatus?: string;
  amount?: number;
  currency?: string;
  pricingBreakdown?: PricingBreakdown;
  paymentSnapshot?: PaymentSnapshot;
  progress?: Progress;
  userSnapshot?: UserSnapshot;
  trainerSnapshot?: TrainerSnapshot;
  tierSnapshot?: TierSnapshot;
  planSnapshot?: PlanSnapshot;
  sessionSnapshot?: SessionSnapshot;
  bookingType?: string;
  bookingSource?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Session {
  id: string;
  slotDate?: string;
  sessionDate?: string;
  slotTime?: string;
  sessionTime?: string;
  timezone?: string;
  status?: string;
  attendanceMarked?: boolean;
}

export interface Note {
  id: string;
  adminName?: string;
  adminUid?: string;
  createdAt?: string | null;
  note?: string;
}

export interface AuditLog {
  id: string;
  action?: string;
  reason?: string;
  createdAt?: string | null;
  adminName?: string;
  adminId?: string;
  entity?: string;
  previousValue?: any;
  newValue?: any;
}

// --- Helper Functions ---

function serializeTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "_seconds" in value
  ) {
    const seconds = Number((value as { _seconds: number })._seconds);
    if (Number.isFinite(seconds)) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function formatDateString(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return "N/A";
  }
}

function firestoreSafeReplacer(key: string, value: any) {
  if (value && typeof value === "object") {
    if (value.toDate || value._seconds !== undefined) {
      return serializeTimestamp(value);
    }
  }
  return value;
}

function normalizeBooking(id: string, data: any): Booking {
  return {
    id,
    bookingReference: data.bookingReference,
    orderId: data.orderId,
    paymentId: data.paymentId,
    userId: data.userId,
    trainerId: data.trainerId,
    status: data.status,
    bookingStatus: data.bookingStatus,
    paymentStatus: data.paymentStatus,
    amount: data.amount,
    currency: data.currency,
    pricingBreakdown: data.pricingBreakdown,
    paymentSnapshot: {
      ...data.paymentSnapshot,
      paidAt: serializeTimestamp(data.paymentSnapshot?.paidAt),
    },
    progress: data.progress,
    userSnapshot: data.userSnapshot,
    trainerSnapshot: data.trainerSnapshot,
    tierSnapshot: data.tierSnapshot,
    planSnapshot: data.planSnapshot,
    sessionSnapshot: data.sessionSnapshot,
    bookingType: data.bookingType,
    bookingSource: data.bookingSource,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

function normalizeSession(id: string, data: any): Session {
  return {
    id,
    slotDate: data.slotDate,
    sessionDate: data.sessionDate,
    slotTime: data.slotTime,
    sessionTime: data.sessionTime,
    timezone: data.timezone,
    status: data.status,
    attendanceMarked: data.attendanceMarked,
  };
}

function normalizeNote(id: string, data: any): Note {
  return {
    id,
    adminName: data.adminName,
    adminUid: data.adminUid,
    createdAt: serializeTimestamp(data.createdAt),
    note: data.note,
  };
}

function normalizeAuditLog(id: string, data: any): AuditLog {
  return {
    id,
    action: data.action,
    reason: data.reason,
    createdAt: serializeTimestamp(data.createdAt),
    adminName: data.adminName,
    adminId: data.adminId,
    entity: data.entity,
    previousValue: data.previousValue,
    newValue: data.newValue,
  };
}

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BookingDetailsPage({
  params,
}: PageProps) {
  const { id: bookingId } = await params;

  if (!bookingId || typeof bookingId !== "string") {
    notFound();
  }

  const db = getAdminDb();

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    notFound();
  }

  const rawBooking = bookingSnap.data() || {};
  const booking = normalizeBooking(bookingSnap.id, rawBooking);

  // Fetch actual sessions
  const sessionsSnap = await db.collection("sessions").where("bookingId", "==", bookingId).orderBy("createdAt", "asc").get().catch(async () => {
    // Fallback if no index on createdAt
    const backupSnap = await db.collection("sessions").where("bookingId", "==", bookingId).get();
    return backupSnap;
  });
  const sessions = sessionsSnap.docs.map(d => normalizeSession(d.id, d.data()));

  // Sort sessions chronologically if fallback used
  // Order by date, then by real start time. Comparing the time text directly
  // is wrong ("10 AM" < "9 AM", "7 PM" < "8 AM"), so parse AM/PM to minutes.
  const minutesOfDay = (t?: string) => {
    const m = (t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i);
    if (!m) return 0;
    let h = parseInt(m[1], 10);
    const pm = m[3].toLowerCase() === 'p';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return h * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  };
  sessions.sort((a, b) => {
    const dateA = a.slotDate || a.sessionDate || '';
    const dateB = b.slotDate || b.sessionDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return minutesOfDay(a.slotTime || a.sessionTime) - minutesOfDay(b.slotTime || b.sessionTime);
  });

  // Fetch notes
  const notesSnap = await db.collection(`bookings/${bookingId}/notes`).orderBy("createdAt", "desc").get();
  const notes = notesSnap.docs.map(d => normalizeNote(d.id, d.data()));

  // Fetch audit logs
  let auditLogs: AuditLog[] = [];
  try {
     const auditSnap = await db.collection("audit_logs").where("entityId", "==", bookingId).orderBy("createdAt", "desc").get();
     auditLogs = auditSnap.docs.map(d => normalizeAuditLog(d.id, d.data()));
  } catch(e) {
     try {
       const auditSnap = await db.collection("audit_logs").where("bookingId", "==", bookingId).orderBy("createdAt", "desc").get();
       auditLogs = auditSnap.docs.map(d => normalizeAuditLog(d.id, d.data()));
     } catch(e2) {
       // Ignore if not found
     }
  }

  // Fetch active trainers for the "Change Trainer" dropdown
  let activeTrainers: TrainerOption[] = [];
  try {
    const trainersSnap = await db.collection("trainers").where("status", "==", "active").get();
    activeTrainers = trainersSnap.docs
      .filter((d) => !d.data().isPaused)
      .map((d) => ({
        id: d.id,
        name: d.data().name || d.data().fullName || "Unnamed Trainer",
      }));
  } catch (error) {
    console.error("Failed to fetch active trainers list", error);
  }

  // Fetch Refund queue state
  let refundQueueState: RefundQueueState | null = null;
  if (booking.paymentId && typeof booking.paymentId === "string") {
    try {
      // According to production refund schema, paymentId is the document ID for manual_refund_queue
      const refundDoc = await db.collection("manual_refund_queue").doc(booking.paymentId).get();
      if (refundDoc.exists) {
        const data = refundDoc.data();
        refundQueueState = { status: data?.status || "UNKNOWN" };
      }
    } catch (error) {
      console.error(`Failed to fetch refund queue state for paymentId: ${booking.paymentId}`, error);
      // Fail safely, treat as unknown/no-refund
      refundQueueState = null;
    }
  }

  // Data Integrity Discrepancies
  const discrepancies: string[] = [];
  const pricing = booking.pricingBreakdown || {};
  const progress = booking.progress || {};

  // Fix: Currency-aware normalization for discrepancies
  const currency = (booking.currency || "INR").toUpperCase();
  const isZeroDecimal = ["JPY", "KRW", "VND"].includes(currency);
  const multiplier = isZeroDecimal ? 1 : 100;

  if (typeof booking.amount === 'number' && typeof pricing.finalAmount === 'number') {
    if (booking.amount / multiplier !== pricing.finalAmount) {
      discrepancies.push(`Amount mismatch: booking.amount (${booking.amount / multiplier} ${currency} equivalent) != pricing.finalAmount (${pricing.finalAmount} ${currency})`);
    }
  }
  
  if (booking.paymentSnapshot?.amount && booking.paymentSnapshot.amount !== booking.amount) {
    discrepancies.push(`Amount mismatch: paymentSnapshot.amount (${booking.paymentSnapshot.amount}) != booking.amount (${booking.amount})`);
  }

  const actualTotal = sessions.length;
  const actualCompleted = sessions.filter(s => s.status === 'completed').length;
  const actualRemaining = sessions.filter(s => s.status !== 'completed' && s.status !== 'cancelled').length;

  if (actualTotal > 0 && actualTotal !== (progress.totalSessions || 0)) {
    discrepancies.push(`Session count mismatch: actual (${actualTotal}) != progress.totalSessions (${progress.totalSessions || 0})`);
  }
  if (actualCompleted !== (progress.completedSessions || 0)) {
    discrepancies.push(`Completed session mismatch: actual (${actualCompleted}) != progress.completedSessions (${progress.completedSessions || 0})`);
  }
  if (actualRemaining !== (progress.remainingSessions || 0)) {
    discrepancies.push(`Remaining session mismatch: actual (${actualRemaining}) != progress.remainingSessions (${progress.remainingSessions || 0})`);
  }

  const bStatus = (booking.status || booking.bookingStatus || 'confirmed').toLowerCase();
  const pStatus = (booking.paymentStatus || booking.paymentSnapshot?.status || 'paid').toLowerCase();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header section */}
      <div className="space-y-4">
        <Link href="/dashboard/bookings" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Bookings
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {booking.bookingReference || booking.id}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge 
                variant={bStatus === 'cancelled' ? 'destructive' : bStatus === 'pending' ? 'secondary' : 'default'} 
                className={`capitalize ${bStatus === 'confirmed' ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
              >
                {bStatus}
              </Badge>
              <span className="text-muted-foreground">•</span>
              <Badge 
                variant={pStatus === 'failed' ? 'destructive' : 'default'}
                className={pStatus === 'refunded' ? 'bg-amber-500' : pStatus === 'paid' ? 'bg-green-500 hover:bg-green-600' : ''}
              >
                {pStatus.toUpperCase()}
              </Badge>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm font-medium text-muted-foreground capitalize">{booking.bookingType || "Subscription"}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm font-medium text-muted-foreground">
                Created: {formatDateString(booking.createdAt)}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <CancelBookingModal
              bookingId={booking.id}
              bookingReference={booking.bookingReference ?? booking.id}
              disabled={bStatus === "cancelled" || bStatus === "completed"}
            />
            <Button variant="outline" disabled title="Backend operation not yet implemented">
              Reschedule Booking
            </Button>
            <ChangeTrainerModal
              bookingId={booking.id}
              currentTrainerId={booking.trainerId}
              currentTrainerName={booking.trainerSnapshot?.trainerName ?? booking.trainerSnapshot?.name}
              trainers={activeTrainers}
              disabled={bStatus === "cancelled" || bStatus === "completed"}
            />
            {booking.paymentSnapshot?.gateway === "offline" ? (
              <Button variant="outline" disabled title="Paid offline: refund the client directly">
                Paid offline ({(booking.paymentSnapshot as { method?: string }).method ?? "manual"}) – refund directly
              </Button>
            ) : (
            <RefundRequestModal
              data={{
                bookingId: booking.id,
                bookingReference: booking.bookingReference ?? "",
                customerName: booking.userSnapshot?.name ?? "Unknown",
                paymentId: booking.paymentId ?? "",
                refundAmount: booking.amount ?? 0,
                currency: booking.currency ?? "INR",
                refundStatus: refundQueueState?.status ?? null
              }}
            />
            )}
          </div>
        </div>
      </div>

      {discrepancies.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex flex-col gap-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-5 h-5" />
            ⚠ Data Discrepancy Detected
          </div>
          <ul className="list-disc pl-6 text-sm">
            {discrepancies.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card shadow-sm rounded-lg p-5 border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer (Snapshot)</h2>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{booking.userSnapshot?.name || 'N/A'}</p>
            <p className="text-muted-foreground break-all">{booking.userSnapshot?.email || 'N/A'}</p>
            <p className="text-muted-foreground">{booking.userSnapshot?.phoneNumber || booking.userSnapshot?.phone || 'N/A'}</p>
          </div>
        </div>

        <div className="bg-card shadow-sm rounded-lg p-5 border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trainer (Snapshot)</h2>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{booking.trainerSnapshot?.trainerName || booking.trainerSnapshot?.name || 'N/A'}</p>
            <p className="text-muted-foreground">Tier: {booking.tierSnapshot?.tierName || booking.tierSnapshot?.name || 'N/A'}</p>
          </div>
        </div>

        <div className="bg-card shadow-sm rounded-lg p-5 border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Plan Snapshot</h2>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{booking.planSnapshot?.title || booking.planSnapshot?.name || 'N/A'}</p>
            <p className="text-muted-foreground">{booking.planSnapshot?.scheduleName || 'N/A'}</p>
          </div>
        </div>

        <div className="bg-card shadow-sm rounded-lg p-5 border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payment Snapshot</h2>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{booking.amount !== undefined ? (booking.amount / multiplier).toFixed(isZeroDecimal ? 0 : 2) : 0} {currency}</p>
            <p className="text-muted-foreground capitalize">{booking.paymentSnapshot?.gateway || 'N/A'}</p>
            <p className="text-muted-foreground break-all text-xs font-mono">{booking.paymentId || 'N/A'}</p>
          </div>
        </div>

        <div className="bg-card shadow-sm rounded-lg p-5 border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">GST Breakdown</h2>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">Base: {(booking.pricingBreakdown?.originalAmount ?? 0).toFixed(2)} {currency}</p>
            <p className="text-muted-foreground">
              GST ({booking.pricingBreakdown?.taxPercentage ?? 0}%): {(booking.pricingBreakdown?.taxAmount ?? 0).toFixed(2)} {currency}
            </p>
            <p className="font-medium">Total: {(booking.pricingBreakdown?.finalAmount ?? 0).toFixed(2)} {currency}</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-card shadow-sm rounded-lg p-6 border">
        <h2 className="text-xl font-bold mb-4">Progress</h2>
        <div className="grid grid-cols-3 gap-8 text-center max-w-xl">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Completed</div>
            <div className="text-3xl font-bold">{progress.completedSessions || 0}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Remaining</div>
            <div className="text-3xl font-bold">{progress.remainingSessions || 0}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Total</div>
            <div className="text-3xl font-bold">{progress.totalSessions || 0}</div>
          </div>
        </div>
        <div className="max-w-xl mt-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Overall Progress</span>
            <span>{Math.min(100, Math.round(((progress.completedSessions || 0) / (progress.totalSessions || 1)) * 100)) || 0}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-3">
            <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${Math.min(100, ((progress.completedSessions || 0) / (progress.totalSessions || 1)) * 100) || 0}%` }}></div>
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-card shadow-sm rounded-lg border overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Sessions</h2>
          <p className="text-sm text-muted-foreground">Displaying {actualTotal} actual session(s)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                <th className="px-6 py-3">#</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Trainer</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Attendance</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session, index) => (
                <tr key={session.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium">{index + 1}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{session.slotDate || session.sessionDate || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{session.slotTime || session.sessionTime || 'N/A'} {session.timezone || ''}</td>
                  <td className="px-6 py-4">{booking.trainerSnapshot?.trainerName || booking.trainerSnapshot?.name || 'N/A'}</td>
                  <td className="px-6 py-4">{booking.userSnapshot?.name || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-secondary rounded-md text-xs font-medium capitalize">{session.status || 'Scheduled'}</span>
                  </td>
                  <td className="px-6 py-4">
                    {session.attendanceMarked ? (
                      <span className="text-green-600 font-medium">Marked</span>
                    ) : (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <AdminAttendanceButton 
                      bookingId={bookingId} 
                      sessionId={session.id} 
                      status={session.status} 
                    />
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    No sessions found for this booking.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Admin Notes */}
      <div className="bg-card shadow-sm rounded-lg p-6 border">
        <h2 className="text-xl font-bold mb-4">Admin Notes</h2>
        
        <div className="mb-6 pb-6 border-b">
          <AdminNoteForm bookingId={bookingId} />
        </div>

        <div className="space-y-4">
          {notes.map(note => (
            <div key={note.id} className="p-4 bg-muted/30 rounded-lg border">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-foreground">{note.adminName || note.adminUid || 'Unknown Admin'}</span>
                <span className="text-xs text-muted-foreground">{formatDateString(note.createdAt)}</span>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.note}</p>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-muted-foreground">No admin notes yet.</p>}
        </div>
      </div>
      
      {/* Audit History */}
      <div className="bg-card shadow-sm rounded-lg p-6 border">
        <h2 className="text-xl font-bold mb-4">Audit History</h2>
        <div className="space-y-4">
          {auditLogs.length > 0 ? auditLogs.map(log => (
            <div key={log.id} className="p-3 bg-muted/20 border rounded-lg text-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-foreground capitalize">{log.action || 'Unknown Action'}</span>
                <span className="text-xs text-muted-foreground">{formatDateString(log.createdAt)}</span>
              </div>
              <div className="text-muted-foreground text-xs mb-2">By: {log.adminName || log.adminId || 'System'}</div>
              {log.reason && (
                <div className="mt-1 p-2 bg-background border rounded text-foreground italic">"{log.reason}"</div>
              )}
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No audit logs found for this booking.</p>
          )}
        </div>
      </div>

      {/* Financial Details */}
      <div className="bg-card shadow-sm rounded-lg p-6 border">
        <h2 className="text-xl font-bold mb-4">Financial Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
           <div className="space-y-3">
             <div className="flex justify-between items-center py-2 border-b">
               <span className="text-muted-foreground">Booking Amount</span>
               <span className="font-medium">{booking.amount !== undefined ? (booking.amount / multiplier).toFixed(isZeroDecimal ? 0 : 2) : 0} {currency}</span>
             </div>
             <div className="flex justify-between items-center py-2 border-b">
               <span className="text-muted-foreground">Payment Status</span>
               <span className="font-medium capitalize">{pStatus}</span>
             </div>
             <div className="flex justify-between items-center py-2 border-b">
               <span className="text-muted-foreground">Gateway</span>
               <span className="font-medium capitalize">{booking.paymentSnapshot?.gateway || 'N/A'}</span>
             </div>
             {refundQueueState && (
               <div className="flex justify-between items-center py-2 border-b">
                 <span className="text-muted-foreground">Refund Queue</span>
                 <span className={`px-2 py-0.5 rounded font-medium text-xs ${refundQueueState.status === 'processed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                   {refundQueueState.status.toUpperCase()}
                 </span>
               </div>
             )}
           </div>
           <div className="space-y-3">
             <div className="flex justify-between items-center py-2 border-b">
               <span className="text-muted-foreground">Payment ID</span>
               <span className="font-mono text-xs">{booking.paymentId || 'N/A'}</span>
             </div>
             <div className="flex justify-between items-center py-2 border-b">
               <span className="text-muted-foreground">Order ID</span>
               <span className="font-mono text-xs">{booking.orderId || 'N/A'}</span>
             </div>
             <div className="flex justify-between items-center py-2 border-b">
               <span className="text-muted-foreground">Paid At</span>
               <span className="font-medium">{formatDateString(booking.paymentSnapshot?.paidAt)}</span>
             </div>
           </div>
        </div>
      </div>

      {/* Advanced / Raw Data */}
      <div className="bg-card shadow-sm rounded-lg border overflow-hidden">
        <details className="group">
          <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-6 text-xl">
            <span>Advanced / Raw Booking Data</span>
            <span className="transition group-open:rotate-180">
                <Search className="h-5 w-5 text-muted-foreground" />
            </span>
          </summary>
          <div className="px-6 pb-6 pt-0">
            <div className="bg-zinc-950 text-zinc-300 p-4 rounded-lg overflow-x-auto border border-zinc-800">
              <pre className="text-xs font-mono">
                {JSON.stringify(rawBooking, firestoreSafeReplacer, 2)}
              </pre>
            </div>
          </div>
        </details>
      </div>

    </div>
  );
}
