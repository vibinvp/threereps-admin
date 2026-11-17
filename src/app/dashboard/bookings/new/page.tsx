"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Search, TriangleAlert } from "lucide-react";
import { functions } from "@/lib/firebase/config";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Client = { userId: string; fullName: string; phoneNumber: string; source: string };
type Lookup = { phone: string; found: boolean; client: Client | null };
type Preview = {
  trainerName: string | null; tierName: string | null; scheduleName: string | null;
  basePrice: number; gstPercentage: number; gstAmount: number; totalAmount: number;
  totalSessions: number; firstSession: string; lastSession: string; conflicts: string[]; available: boolean;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card (POS)" },
  { value: "other", label: "Other" },
];

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Engine duration keys: 1_month, 3_month, 6_month, 1_year, 15_days. */
function durationKeyOf(value: number, type: string) {
  const t = String(type || "").toLowerCase().replace(/s$/, "");
  return t === "day" ? `${value}_days` : `${value}_${t}`;
}
const durationLabel = (value: number, type: string) => `${value} ${String(type).replace(/s$/, "")}${value > 1 ? "s" : ""}`;

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export default function NewManualBookingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const requestId = useRef(crypto.randomUUID());

  const { data: trainers } = useFirestoreQuery<any>(["trainers", "active"], "trainers", [where("status", "==", "active")]);
  const { data: tiers } = useFirestoreQuery<any>(["trainer_tiers"], "trainer_tiers");
  const { data: patterns } = useFirestoreQuery<any>(["session_patterns"], "session_patterns");

  // client
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [fullName, setFullName] = useState("");

  // plan
  const [trainerId, setTrainerId] = useState("");
  const [bookingType, setBookingType] = useState<"subscription" | "trial">("subscription");
  const [scheduleId, setScheduleId] = useState("");
  const [durationKey, setDurationKey] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("");

  // preview
  const [preview, setPreview] = useState<{ sig: string; data: Preview } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // payment
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const trainer = useMemo(() => (trainers ?? []).find((t: any) => t.id === trainerId), [trainers, trainerId]);
  const tier = useMemo(() => {
    if (!trainer) return null;
    const id = trainer.trainerTierId || trainer.tierId;
    return (tiers ?? []).find((t: any) => t.id === id) ?? (tiers ?? []).find((t: any) => t.name === trainer.tier || t.displayName === trainer.tier) ?? null;
  }, [trainer, tiers]);

  const activePatterns = useMemo(() => (patterns ?? []).filter((p: any) => p.isActive !== false), [patterns]);
  const plans: any[] = useMemo(
    () => ((tier?.pricing?.subscriptions?.individual?.[scheduleId] ?? []) as any[]).filter((p) => p.active === true),
    [tier, scheduleId]
  );
  const slots: string[] = useMemo(() => {
    const av = trainer?.availability ?? {};
    if (bookingType === "trial") return [...new Set(Object.values(av).filter(Array.isArray).flat() as string[])];
    return Array.isArray(av[scheduleId]) ? av[scheduleId] : [];
  }, [trainer, scheduleId, bookingType]);

  // value -> label maps so each Select shows names, not ids
  const trainerItems = useMemo(() => Object.fromEntries((trainers ?? []).map((t: any) => [t.id, t.name || t.id])), [trainers]);
  const scheduleItems = useMemo(() => Object.fromEntries(activePatterns.map((p: any) => [p.id, p.displayName || p.name || p.id])), [activePatterns]);
  const durationItems = useMemo(
    () => Object.fromEntries(plans.map((p: any) => [durationKeyOf(p.durationValue, p.durationType), durationLabel(p.durationValue, p.durationType)])),
    [plans]
  );
  const typeItems = { subscription: "Subscription", trial: "Trial (1 session)" };
  const methodItems = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

  const planInput = useMemo(
    () => ({
      trainerId, bookingType, planType: "individual", slotDate, slotTime,
      ...(bookingType === "subscription" ? { scheduleId, durationKey } : {}),
    }),
    [trainerId, bookingType, slotDate, slotTime, scheduleId, durationKey]
  );
  const sig = JSON.stringify(planInput);
  const planReady = !!trainerId && !!slotDate && !!slotTime && (bookingType === "trial" || (!!scheduleId && !!durationKey));
  const currentPreview = preview && preview.sig === sig ? preview.data : null;

  const clientReady = !!lookup && (lookup.found || fullName.trim().length >= 2);
  const received = Number(amount);
  const total = currentPreview?.totalAmount ?? 0;
  const differs = !!currentPreview && Number.isFinite(received) && Math.abs(received - total) > 0.004;
  const paymentReady = !!method && Number.isFinite(received) && received > 0 && (!differs || reason.trim().length >= 3);
  const canSubmit = clientReady && !!currentPreview?.available && paymentReady;

  async function doLookup() {
    setLooking(true);
    setLookup(null);
    try {
      const res = await httpsCallable<{ phone: string }, Lookup>(functions, "adminLookupClient")({ phone });
      setLookup(res.data);
      setFullName(res.data.client?.fullName ?? "");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLooking(false);
    }
  }

  async function doPreview() {
    setChecking(true);
    setPreviewError(null);
    try {
      const res = await httpsCallable<typeof planInput, Preview>(functions, "adminPreviewManualBooking")(planInput);
      setPreview({ sig, data: res.data });
      setAmount(String(res.data.totalAmount));
    } catch (e) {
      setPreview(null);
      setPreviewError(errMsg(e));
    } finally {
      setChecking(false);
    }
  }

  async function doCreate() {
    setSubmitting(true);
    try {
      const res = await httpsCallable<any, { bookingId: string; bookingReference: string; clientCreated: boolean }>(functions, "adminCreateManualBooking")({
        ...planInput,
        clientRequestId: requestId.current,
        ...(lookup?.client ? { userId: lookup.client.userId } : { phone, fullName: fullName.trim() }),
        paymentMethod: method,
        paymentReference: reference.trim(),
        amountReceived: received,
        adjustmentReason: differs ? reason.trim() : "",
      });
      toast.success(`Booking ${res.data.bookingReference} created${res.data.clientCreated ? " (new client added)" : ""}.`);
      requestId.current = crypto.randomUUID();
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      router.push(`/dashboard/bookings/${res.data.bookingId}`);
    } catch (e) {
      toast.error(errMsg(e));
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href="/dashboard/bookings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Bookings
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manual Booking</h1>
        <p className="text-muted-foreground">Book a session plan for a client on their behalf and record the payment you collected offline.</p>
      </div>

      {/* 1. Client */}
      <Card>
        <CardHeader>
          <CardTitle>1. Client</CardTitle>
          <CardDescription>Search by phone number. New clients are added automatically and can later sign in on the app with this number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input inputMode="tel" placeholder="Phone number, e.g. 94465 06130" value={phone} onChange={(e) => { setPhone(e.target.value); setLookup(null); }} />
            <Button type="button" onClick={doLookup} disabled={looking || phone.replace(/\D/g, "").length < 10}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />} Look up
            </Button>
          </div>
          {lookup?.found && lookup.client && (
            <p className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Existing client: <span className="font-medium">{lookup.client.fullName || "(no name)"}</span> · {lookup.client.phoneNumber}
            </p>
          )}
          {lookup && !lookup.found && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No client with {lookup.phone}. Enter their name to add them.</p>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" placeholder="Client's full name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Plan */}
      <Card>
        <CardHeader>
          <CardTitle>2. Trainer & plan</CardTitle>
          <CardDescription>Only slots the trainer offers are listed. Price and availability are checked on the server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Trainer</Label>
              <Select items={trainerItems} value={trainerId} onValueChange={(v) => { setTrainerId(v ?? ""); setScheduleId(""); setDurationKey(""); setSlotTime(""); }}>
                <SelectTrigger><SelectValue placeholder="Select trainer" /></SelectTrigger>
                <SelectContent>
                  {(trainers ?? []).filter((t: any) => t.isPaused !== true).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tier && <p className="text-xs text-muted-foreground">Tier: {tier.displayName || tier.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>Booking type</Label>
              <Select items={typeItems} value={bookingType} onValueChange={(v) => { setBookingType((v as any) ?? "subscription"); setSlotTime(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="trial">Trial (1 session)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bookingType === "subscription" && (
              <>
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select items={scheduleItems} value={scheduleId} onValueChange={(v) => { setScheduleId(v ?? ""); setDurationKey(""); setSlotTime(""); }} disabled={!trainerId}>
                    <SelectTrigger><SelectValue placeholder="Select schedule" /></SelectTrigger>
                    <SelectContent>
                      {activePatterns.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.displayName || p.name || p.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select items={durationItems} value={durationKey} onValueChange={(v) => setDurationKey(v ?? "")} disabled={!scheduleId}>
                    <SelectTrigger><SelectValue placeholder={plans.length || !scheduleId ? "Select duration" : "No plans for this schedule"} /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p: any) => {
                        const key = durationKeyOf(p.durationValue, p.durationType);
                        return <SelectItem key={key} value={key}>{durationLabel(p.durationValue, p.durationType)} · {inr(Number(p.price))} + GST</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="slotDate">Start date</Label>
              <Input id="slotDate" type="date" min={tomorrow()} value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time slot</Label>
              <Select value={slotTime} onValueChange={(v) => setSlotTime(v ?? "")} disabled={!trainerId || (bookingType === "subscription" && !scheduleId)}>
                <SelectTrigger><SelectValue placeholder={slots.length ? "Select time" : "No slots offered"} /></SelectTrigger>
                <SelectContent>{slots.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <Button type="button" variant="outline" onClick={doPreview} disabled={!planReady || checking}>
            {checking && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Check price & availability
          </Button>

          {previewError && (
            <p className="flex items-start gap-2 text-sm text-destructive"><TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {previewError}</p>
          )}
          {currentPreview && (
            <div className="rounded-md border p-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{currentPreview.scheduleName ?? "Trial"} · {currentPreview.totalSessions} session{currentPreview.totalSessions > 1 ? "s" : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dates</span><span>{currentPreview.firstSession} → {currentPreview.lastSession}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>{inr(currentPreview.basePrice)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST ({currentPreview.gstPercentage}%)</span><span>{inr(currentPreview.gstAmount)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{inr(currentPreview.totalAmount)}</span></div>
              {currentPreview.available ? (
                <p className="flex items-center gap-2 text-green-600 pt-1"><CheckCircle2 className="h-4 w-4" /> Slot is free for every session.</p>
              ) : (
                <p className="flex items-start gap-2 text-destructive pt-1"><TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> Already booked on {currentPreview.conflicts.slice(0, 4).join(", ")}{currentPreview.conflicts.length > 4 ? ` +${currentPreview.conflicts.length - 4} more` : ""}. Pick another slot, date or trainer.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Payment */}
      <Card>
        <CardHeader>
          <CardTitle>3. Payment received</CardTitle>
          <CardDescription>Payment is collected outside the app. This is recorded on the booking and in the Ledger.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Method</Label>
              <Select items={methodItems} value={method} onValueChange={(v) => setMethod(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount received (₹)</Label>
              <Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!currentPreview} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref">Reference (optional)</Label>
              <Input id="ref" placeholder="Receipt / UPI txn no." value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
            </div>
          </div>
          {differs && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for charging {inr(received || 0)} instead of {inr(total)}</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. staff referral discount" maxLength={500} />
            </div>
          )}
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!canSubmit}>Review & create booking</Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create this booking?</DialogTitle>
            <DialogDescription>It reserves the trainer&apos;s slot for every session and notifies the trainer. It can be cancelled afterwards from the booking page.</DialogDescription>
          </DialogHeader>
          {currentPreview && (
            <div className="rounded-md bg-muted/50 p-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span>{lookup?.client?.fullName || fullName} ({lookup?.phone})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Trainer</span><span>{currentPreview.trainerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{currentPreview.scheduleName ?? "Trial"} · {currentPreview.totalSessions} sessions · {slotTime}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Starts</span><span>{currentPreview.firstSession}</span></div>
              <div className="flex justify-between font-semibold"><span>Received</span><span>{inr(received)} via {PAYMENT_METHODS.find((m) => m.value === method)?.label}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Back</Button>
            <Button onClick={doCreate} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create booking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
