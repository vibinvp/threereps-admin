// Real `payment_sessions` documents (written by the user-app backend) use dimensional state fields,
// NOT a `status: 'Captured'` field, and store `amount` in paise (Razorpay subunits).
// States seen in threereps_user/functions: initiated | success | refund_required | refund_pending |
// refunded | refund_failed.

export type PaymentBadge = 'default' | 'secondary' | 'destructive' | 'outline';

export const PAYMENT_STATES: Record<string, { label: string; badge: PaymentBadge }> = {
  success: { label: 'Paid', badge: 'default' },
  initiated: { label: 'Initiated', badge: 'outline' },
  refund_required: { label: 'Refund required', badge: 'destructive' },
  refund_pending: { label: 'Refund pending', badge: 'secondary' },
  refunded: { label: 'Refunded', badge: 'secondary' },
  refund_failed: { label: 'Refund failed', badge: 'destructive' },
};

export const paymentStateOf = (s: { paymentState?: string }) => s.paymentState ?? 'initiated';
export const paymentLabel = (state: string) => PAYMENT_STATES[state]?.label ?? state;
export const paymentBadge = (state: string): PaymentBadge => PAYMENT_STATES[state]?.badge ?? 'outline';

/** Firestore stores paise; the UI shows rupees. */
export const paiseToRupees = (paise: unknown) => (typeof paise === 'number' ? paise : 0) / 100;
export const formatINR = (paise: unknown) =>
  '₹' + paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
