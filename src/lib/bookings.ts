// Real `bookings` documents (written by the user-app backend, bookingEngine/reconciliation.js) keep
// display data inside snapshot objects, not flat fields. Older/other documents may have flat fields,
// so each helper prefers the snapshot and falls back to the flat field.

type Snap = Record<string, unknown> | null | undefined;
export type BookingLike = {
  trainerName?: string; tier?: string; slotTime?: string; sessionPattern?: string; bookingType?: string;
  trainerSnapshot?: Snap; tierSnapshot?: Snap; planSnapshot?: Snap; trialSnapshot?: Snap; sessionSnapshot?: Snap;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

export const bookingTrainerName = (b: BookingLike) =>
  str(b.trainerSnapshot?.trainerName) ?? str(b.trainerSnapshot?.name) ?? str(b.trainerName) ?? 'Unassigned';

export const bookingTierName = (b: BookingLike) =>
  str(b.tierSnapshot?.displayName) ?? str(b.tierSnapshot?.name) ?? str(b.trainerSnapshot?.tierName) ?? str(b.tier);

export const bookingSlotTime = (b: BookingLike) =>
  str(b.sessionSnapshot?.slotTime) ?? str(b.planSnapshot?.slotTime) ?? str(b.slotTime);

/** e.g. "Mon-Wed-Fri 1 month" for subscriptions, schedule name for trials. */
export const bookingPlanLabel = (b: BookingLike) =>
  str(b.planSnapshot?.title) ?? str(b.planSnapshot?.scheduleName) ?? str(b.trialSnapshot?.scheduleName) ?? str(b.sessionPattern);

export const bookingTypeLabel = (b: BookingLike) => {
  const t = str(b.bookingType);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : undefined;
};
