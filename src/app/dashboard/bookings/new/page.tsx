"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";
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

type Client = { userId: string; fullName: string; phoneNumber: string; source: "users" | "auth"; duplicate?: boolean };
type Lookup = { phone: string; found: boolean; client: Client | null };
type Slot = { slotTime: string; available: boolean; conflicts: string[] };
type Avail = {
  trainerName: string | null; tierName: string | null; scheduleName: string | null;
  basePrice: number; gstPercentage: number; gstAmount: number; totalAmount: number;
  totalSessions: number; firstSession: string; lastSession: string; slots: Slot[];
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card (POS)" },
  { value: "other", label: "Other" },
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Engine duration keys: 1_month, 3_month, 6_month, 1_year, 15_days. */
function durationKeyOf(value: number, type: string) {
  const t = String(type || "").toLowerCase().replace(/s$/, "");
  return t === "day" ? `${value}_days` : `${value}_${t}`;
}
const durationLabel = (value: number, type: string) => `${value} ${String(type).replace(/s$/, "")}${value > 1 ? "s" : ""}`;

function toISODate(d: Date) {
  return d.toLocaleDateString("en-CA");
}
function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

/** Weekdays a schedule runs on (mirrors the booking engine). null = unknown, let the server decide. */
function scheduleDays(...names: unknown[]): number[] | null {
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    if (n.includes("monwedfri")) return [1, 3, 5];
    if (n.includes("tuethusat")) return [2, 4, 6];
    if (n.includes("satsun")) return [6, 0];
    if (n.includes("monsat")) return [1, 2, 3, 4, 5, 6];
    if (n.includes("monsun") || n === "all") return [0, 1, 2, 3, 4, 5, 6];
  }
  return null;
}

/** Slots on the trainer document for a schedule; availability is keyed by display name ("Mon-Sat"). */
function trainerSlots(trainer: any, bookingType: string, ...scheduleNames: unknown[]): string[] {
  const av = trainer?.availability ?? {};
  const wanted = new Set(scheduleNames.map(norm).filter(Boolean));
  const lists = Object.entries(av).filter(([k, v]) => Array.isArray(v) && (bookingType === "trial" || wanted.has(norm(k)))).map(([, v]) => v as string[]);
  return [...new Set(lists.flat().filter((x) => typeof x === "string" && /[ap]\.?m/i.test(x)))];
}

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

  // plan (raw selections; anything that stops being valid is dropped below, not blindly kept)
  const [trainerId, setTrainerId] = useState("");
  const [bookingType, setBookingType] = useState<"subscription" | "trial">("subscription");
  const [scheduleId, setScheduleId] = useState("");
  const [durationKey, setDurationKey] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("");

  // payment
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isTrial = bookingType === "trial";
  const trainer = useMemo(() => (trainers ?? []).find((t: any) => t.id === trainerId), [trainers, trainerId]);
  const tier = useMemo(() => {
    if (!trainer) return null;
    const id = trainer.trainerTierId || trainer.tierId;
    return (tiers ?? []).find((t: any) => t.id === id) ?? (tiers ?? []).find((t: any) => t.name === trainer.tier || t.displayName === trainer.tier) ?? null;
  }, [trainer, tiers]);

  const activePatterns = useMemo(() => (patterns ?? []).filter((p: any) => p.isActive !== false), [patterns]);
  const pattern = useMemo(() => activePatterns.find((p: any) => p.id === scheduleId), [activePatterns, scheduleId]);
  const scheduleNames = useMemo(() => [scheduleId, pattern?.displayName, pattern?.name], [scheduleId, pattern]);

  const plans: any[] = useMemo(
    () => ((tier?.pricing?.subscriptions?.individual?.[scheduleId] ?? []) as any[]).filter((p) => p.active === true),
    [tier, scheduleId]
  );
  const durationItems = useMemo(
    () => Object.fromEntries(plans.map((p: any) => [durationKeyOf(p.durationValue, p.durationType), `${durationLabel(p.durationValue, p.durationType)} · ${inr(Number(p.price))} + GST`])),
    [plans]
  );
  // Changing trainer/schedule keeps what is still valid and drops what is not.
  const effDuration = isTrial ? "" : durationItems[durationKey] ? durationKey : "";

  // start date vs schedule weekdays
  const days = isTrial ? null : scheduleDays(...scheduleNames);
  const dateParts = slotDate ? new Date(`${slotDate}T00:00:00`) : null;
  const dateError = !slotDate
    ? null
    : slotDate < tomorrow()
      ? "Bookings must start tomorrow or later."
      : days && dateParts && !days.includes(dateParts.getDay())
        ? `${pattern?.displayName ?? "This schedule"} runs on ${days.map((d) => DAY_NAMES[d]).join(", ")}. Pick a start date on one of those days.`
        : null;

  const ready = !!trainerId && !!slotDate && !dateError && (isTrial || (!!scheduleId && !!effDuration));
  const input = useMemo(
    () => ({ trainerId, bookingType, planType: "individual", slotDate, ...(isTrial ? {} : { scheduleId, durationKey: effDuration }) }),
    [trainerId, bookingType, isTrial, slotDate, scheduleId, effDuration]
  );
  const sig = JSON.stringify(input);

  // server: price + availability of every slot this trainer offers for the plan (auto-refreshes on any change)
  const [availState, setAvailState] = useState<{ sig: string; data?: Avail; error?: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await httpsCallable<typeof input, Avail>(functions, "adminPreviewManualBooking")(input);
        if (!cancelled) setAvailState({ sig, data: res.data });
      } catch (e) {
        if (!cancelled) setAvailState({ sig, error: errMsg(e) });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready, refreshTick]);

  const avail = ready && availState?.sig === sig ? availState : null;
  const loadingAvail = ready && !avail;
  const data = avail?.data;

  const slotList: Slot[] = useMemo(() => {
    if (data) return data.slots;
    // before the server answers, show what the trainer document lists (availability unknown yet)
    return trainerSlots(trainer, bookingType, ...scheduleNames).map((slotTime) => ({ slotTime, available: true, conflicts: [] }));
  }, [data, trainer, bookingType, scheduleNames]);
  const slotItems = useMemo(
    () => Object.fromEntries(slotList.map((s) => [s.slotTime, s.available ? s.slotTime : `${s.slotTime} · booked`])),
    [slotList]
  );
  const chosen = slotList.find((s) => s.slotTime === slotTime);
  const effSlot = chosen && (!data || chosen.available) ? chosen.slotTime : "";
  const slotDropped = !!slotTime && !chosen;
  const freeCount = slotList.filter((s) => s.available).length;

  const summary = data && effSlot ? data : null;
  const clientReady = !!lookup && (lookup.found ? true : fullName.trim().length >= 2) && !(lookup.found && lookup.client?.source === "auth" && fullName.trim().length < 2);
  const received = Number(amount);
  const total = data?.totalAmount ?? 0;
  const differs = !!summary && Number.isFinite(received) && Math.abs(received - total) > 0.004;
  const paymentReady = !!method && Number.isFinite(received) && received > 0 && (!differs || reason.trim().length >= 3);
  const canSubmit = clientReady && !!summary && !!effSlot && paymentReady && !submitting;

  // Prefill the amount with the plan total whenever the total changes (a manual edit is discarded when the plan changes,
  // so a stale amount from an earlier plan can never be submitted by accident).
  const prefill = data?.totalAmount;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync form field with server-calculated total
    if (prefill !== undefined) setAmount(String(prefill));
  }, [prefill]);

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

  async function doCreate() {
    if (!effSlot) return;
    setSubmitting(true);
    try {
      const useExisting = lookup?.client?.source === "users";
      const res = await httpsCallable<any, { bookingId: string; bookingReference: string; clientCreated: boolean }>(functions, "adminCreateManualBooking")({
        ...input,
        slotTime: effSlot,
        clientRequestId: requestId.current,
        ...(useExisting ? { userId: lookup!.client!.userId } : { phone, fullName: fullName.trim() }),
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
      setRefreshTick((n) => n + 1); // someone may have just taken the slot: show fresh availability
    } finally {
      setSubmitting(false);
    }
  }

  const trainerItems = useMemo(() => Object.fromEntries((trainers ?? []).map((t: any) => [t.id, t.name || t.id])), [trainers]);
  const scheduleItems = useMemo(() => Object.fromEntries(activePatterns.map((p: any) => [p.id, p.displayName || p.name || p.id])), [activePatterns]);
  const typeItems = { subscription: "Subscription", trial: "Trial (1 session)" };
  const methodItems = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));
  const trainerName = trainer?.name ?? "This trainer";

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
            <Input inputMode="tel" placeholder="Phone number, e.g. 94465 06130" value={phone} onChange={(e) => { setPhone(e.target.value); setLookup(null); }} onKeyDown={(e) => { if (e.key === "Enter" && phone.replace(/\D/g, "").length >= 10 && !looking) doLookup(); }} />
            <Button type="button" onClick={doLookup} disabled={looking || phone.replace(/\D/g, "").length < 10}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />} Look up
            </Button>
          </div>
          {lookup?.found && lookup.client && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Existing client: <span className="font-medium">{lookup.client.fullName || "(no name on file)"}</span> · {lookup.client.phoneNumber}
              </p>
              {lookup.client.duplicate && (
                <p className="flex items-start gap-2 text-sm text-amber-600"><TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> More than one profile uses this number. The first match is used; ask a developer to merge duplicates.</p>
              )}
              {lookup.client.source === "auth" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">This number has a login but no profile yet. Enter their name to create it.</p>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" placeholder="Client's full name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
                </div>
              )}
            </div>
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
          <CardDescription>Time slots come from the trainer you pick and are checked against existing bookings for every session of the plan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Trainer</Label>
              <Select items={trainerItems} value={trainerId} onValueChange={(v) => setTrainerId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select trainer" /></SelectTrigger>
                <SelectContent>
                  {(trainers ?? []).filter((t: any) => t.isPaused !== true).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {trainer && <p className="text-xs text-muted-foreground">{tier ? `Tier: ${tier.displayName || tier.name}` : "No pricing tier found for this trainer"}</p>}
            </div>
            <div className="space-y-2">
              <Label>Booking type</Label>
              <Select items={typeItems} value={bookingType} onValueChange={(v) => setBookingType((v as any) ?? "subscription")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="trial">Trial (1 session)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isTrial && (
              <>
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select items={scheduleItems} value={scheduleId} onValueChange={(v) => setScheduleId(v ?? "")}>
                    <SelectTrigger><SelectValue placeholder="Select schedule" /></SelectTrigger>
                    <SelectContent>
                      {activePatterns.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.displayName || p.name || p.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select items={durationItems} value={effDuration} onValueChange={(v) => setDurationKey(v ?? "")} disabled={!scheduleId || !tier}>
                    <SelectTrigger><SelectValue placeholder={!scheduleId ? "Select a schedule first" : plans.length ? "Select duration" : "No plans for this schedule"} /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p: any) => {
                        const key = durationKeyOf(p.durationValue, p.durationType);
                        return <SelectItem key={key} value={key}>{durationLabel(p.durationValue, p.durationType)} · {inr(Number(p.price))} + GST</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  {scheduleId && tier && plans.length === 0 && (
                    <p className="text-xs text-destructive">{tier.displayName || tier.name} has no active plan for {pattern?.displayName ?? "this schedule"}. Add one under Trainer Tiers.</p>
                  )}
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="slotDate">Start date</Label>
              <Input id="slotDate" type="date" min={tomorrow()} value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
              {dateError && <p className="text-xs text-destructive">{dateError}</p>}
            </div>
            <div className="space-y-2">
              <Label>Time slot</Label>
              <Select items={slotItems} value={effSlot} onValueChange={(v) => setSlotTime(v ?? "")} disabled={!ready || slotList.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingAvail ? "Checking availability…" : !ready ? "Fill the plan first" : slotList.length ? "Select time" : "No slots"} />
                </SelectTrigger>
                <SelectContent>
                  {slotList.map((s) => (
                    <SelectItem key={s.slotTime} value={s.slotTime} disabled={!s.available}>
                      {s.available ? s.slotTime : `${s.slotTime} · booked`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ready && data && slotList.length > 0 && (
                <p className="text-xs text-muted-foreground">{freeCount} of {slotList.length} slot{slotList.length > 1 ? "s" : ""} free for all {data.totalSessions} session{data.totalSessions > 1 ? "s" : ""}.</p>
              )}
            </div>
          </div>

          {loadingAvail && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking price and availability…</p>}

          {avail?.error && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              <span className="flex items-start gap-2"><TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {avail.error}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setRefreshTick((n) => n + 1)}>Retry</Button>
            </div>
          )}

          {data && slotList.length === 0 && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {trainerName} has no time slots set for {isTrial ? "trials" : (data.scheduleName ?? "this schedule")}. Choose another trainer or schedule.
            </p>
          )}
          {data && slotList.length > 0 && freeCount === 0 && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> Every slot {trainerName} offers is already booked on at least one session date starting {data.firstSession}. Try another start date, schedule or trainer.
            </p>
          )}
          {slotDropped && !loadingAvail && (
            <p className="flex items-start gap-2 text-sm text-amber-600">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {slotTime} isn&apos;t offered by {trainerName} for this plan. Pick one of the listed slots.
            </p>
          )}
          {data && effSlot && chosen && !chosen.available && (
            <p className="text-sm text-destructive">{effSlot} is booked on {chosen.conflicts.slice(0, 4).join(", ")}{chosen.conflicts.length > 4 ? ` +${chosen.conflicts.length - 4} more` : ""}.</p>
          )}

          {data && (
            <div className="rounded-md border p-4 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{data.trainerName} · {data.tierName}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRefreshTick((n) => n + 1)} title="Re-check availability">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{data.scheduleName ?? "Trial"} · {data.totalSessions} session{data.totalSessions > 1 ? "s" : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dates</span><span>{data.firstSession} → {data.lastSession}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>{inr(data.basePrice)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST ({data.gstPercentage}%)</span><span>{inr(data.gstAmount)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{inr(data.totalAmount)}</span></div>
              {summary && <p className="flex items-center gap-2 text-green-600 pt-1"><CheckCircle2 className="h-4 w-4" /> {effSlot} is free for every session.</p>}
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
              <Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!summary} />
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
          {!canSubmit && (
            <p className="text-xs text-muted-foreground">
              Still needed: {[!clientReady && "client", !effSlot && "trainer, plan and a free time slot", !!effSlot && !paymentReady && "payment details"].filter(Boolean).join(", ") || "—"}.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create this booking?</DialogTitle>
            <DialogDescription>It reserves the trainer&apos;s slot for every session and notifies the trainer. It can be cancelled afterwards from the booking page.</DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="rounded-md bg-muted/50 p-4 text-sm space-y-1">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Client</span><span className="text-right">{lookup?.client?.fullName || fullName} ({lookup?.phone})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Trainer</span><span>{summary.trainerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{summary.scheduleName ?? "Trial"} · {summary.totalSessions} sessions · {effSlot}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Starts</span><span>{summary.firstSession}</span></div>
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
