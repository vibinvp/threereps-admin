import { z } from 'zod';

export const adminSchema = z.object({
  id: z.string().optional(),
  uid: z.string(),
  email: z.string().email(),
  role: z.string().default('admin'),
  isActive: z.boolean().optional(),
  createdAt: z.any().optional(), // Firebase Timestamp
});

export const userSchema = z.object({
  id: z.string().optional(),
  uid: z.string(),
  name: z.string(),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  photoUrl: z.string().optional(),
  createdAt: z.any().optional(),
});

export const trainerSchema = z.object({
  id: z.string().optional(),
  uid: z.string().optional(),
  
  // Basic Info (Note: document uses `name` as primary, `fullName` can be empty)
  name: z.string().default("Unnamed Trainer"),
  fullName: z.string().optional(),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  photoUrl: z.string().optional(),
  gender: z.string().optional(),
  age: z.union([z.number(), z.string()]).optional(),
  
  // Work & Tier
  tier: z.string().default("Standard"),
  status: z.string().default("active"), // "active", "pending", "deactivated"
  isPaused: z.boolean().default(false),
  experienceYears: z.union([z.number(), z.string()]).optional(),
  experienceLevel: z.string().optional(),
  commissionRate: z.union([z.number(), z.string()]).optional(),
  rating: z.number().default(0),
  
  // Details & Arrays
  bio: z.string().optional(),
  specialization: z.array(z.string()).default([]),
  languagesSpoken: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  certificateUrls: z.array(z.string()).default([]),
  
  // Hours & Availability
  startTime: z.string().optional(), // "4 AM"
  endTime: z.string().optional(),   // "12 AM"
  sessionDuration: z.union([z.number(), z.string()]).optional(),
  availability: z.record(z.string(), z.array(z.string())).optional(), // Map of e.g. "Mon-Sat": ["4 AM", ...]

  // Pricing Structures
  pricing: z.record(z.string(), z.any()).optional(),
  plans: z.record(z.string(), z.any()).optional(),
  couplePricing: z.record(z.string(), z.any()).optional(),
  trialPrice: z.record(z.string(), z.any()).optional(),
  
  // Timestamps
  joinedDate: z.any().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const bookingSchema = z.object({
  id: z.string().optional(),
  bookingReference: z.string().optional(), // e.g. "3R-2026-000001"
  bookingType: z.string().optional(), // "trial", "subscription"
  bookingStatus: z.string().default("confirmed"), // "confirmed", "completed", "cancelled", "pending"
  paymentStatus: z.string().default("paid"), // "paid", "failed", "refunded"
  paymentId: z.string().optional(), // Razorpay payment ID
  orderId: z.string().optional(), // Razorpay order ID
  
  // Client Metadata
  userId: z.string(),
  userName: z.string().default("N/A"),
  userPhone: z.string().optional(),
  
  // Trainer Metadata
  trainerId: z.string(),
  trainerName: z.string().default("Unassigned"),
  tier: z.string().optional(),
  
  // Schedule & Progress
  slotTime: z.string().optional(), // e.g. "1 PM"
  slotHour: z.string().optional(),
  sessionPattern: z.string().optional(), // e.g. "Mon-Sat"
  completedSessions: z.number().default(0),
  totalSessions: z.number().default(26),
  remainingSessions: z.number().default(26),
  duration: z.string().optional(), // "1_month"
  
  // Timestamps
  startDate: z.any().optional(),
  expiryDate: z.any().optional(),
  createdAt: z.any().optional(),
  
  // Snapshots written by the booking engine (all optional; shapes per reconciliation.js)
  trainerSnapshot: z.object({
    trainerId: z.string().nullish(),
    trainerName: z.string().nullish(),
    name: z.string().nullish(), // legacy
    tierId: z.string().nullish(),
    tierName: z.string().nullish(),
  }).passthrough().optional(),
  tierSnapshot: z.object({
    id: z.string().nullish(),
    name: z.string().nullish(),
    displayName: z.string().nullish(),
  }).passthrough().optional(),
  planSnapshot: z.object({
    title: z.string().nullish(),
    scheduleName: z.string().nullish(),
    planType: z.string().nullish(),
    sessionPerWeek: z.number().nullish(),
    totalSessions: z.number().nullish(),
    price: z.number().nullish(),
    slotTime: z.string().nullish(), // legacy (manual-override form)
  }).passthrough().nullish(),
  trialSnapshot: z.object({
    scheduleName: z.string().nullish(),
    sessionCount: z.number().nullish(),
    price: z.number().nullish(),
  }).passthrough().nullish(),
  sessionSnapshot: z.object({
    slotDate: z.string().nullish(),
    slotTime: z.string().nullish(),
    slotHour: z.union([z.string(), z.number()]).nullish(),
  }).passthrough().nullish(),
});

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  order: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const planSchema = z.object({
  title: z.string().min(1, "Title is required"),
  durationValue: z.coerce.number().min(1),
  durationType: z.enum(['days', 'weeks', 'months', 'years']),
  price: z.coerce.number().nonnegative(),
  popular: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  availableFrom: z.any().optional(), // Firebase Timestamp
  availableUntil: z.any().optional(), // Firebase Timestamp
});

export const sessionPatternSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().min(1, "Display name is required"),
  daysPerWeek: z.coerce.number().int().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const trialBookingSchema = z.object({
  price: z.coerce.number().nonnegative().catch(0),
  active: z.boolean().default(true),
  popular: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

const subscriptionSchema = z.record(z.string(), z.array(planSchema).default([])).catch({});

export const trainerTierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Tier name is required"),
  commissionRate: z.coerce.number().nonnegative().catch(0),
  position: z.coerce.number().int().nonnegative().catch(0),
  isActive: z.boolean().default(true),
  badgeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/i, "Must be a valid hex color"),
  badgeTextColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/i, "Must be a valid hex color"),
  borderColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/i, "Must be a valid hex color"),
  gradientStart: z.string().regex(/^#[0-9A-Fa-f]{6}$/i, "Must be a valid hex color"),
  gradientEnd: z.string().regex(/^#[0-9A-Fa-f]{6}$/i, "Must be a valid hex color"),
  icon: z.string().default("workspace_premium"),
  shortDescription: z.string().optional(),
  pricing: z.object({
    trial: z.object({
      individual: trialBookingSchema.default({ price: 0, active: true, popular: false, sortOrder: 0 }),
      couple: trialBookingSchema.default({ price: 0, active: true, popular: false, sortOrder: 0 }),
    }).default({
      individual: { price: 0, active: true, popular: false, sortOrder: 0 },
      couple: { price: 0, active: true, popular: false, sortOrder: 0 },
    }),
    subscriptions: z.object({
      individual: subscriptionSchema,
      couple: subscriptionSchema,
    }).default({ individual: {}, couple: {} }),
  }).default({
    trial: {
      individual: { price: 0, active: true, popular: false, sortOrder: 0 },
      couple: { price: 0, active: true, popular: false, sortOrder: 0 },
    },
    subscriptions: { individual: {}, couple: {} },
  }),
  version: z.number().optional(),
  updatedAt: z.any().optional(),
  updatedBy: z.string().optional(),
});

export const taxConfigSchema = z.object({
  gstPercentage: z.coerce.number().min(0, "Must be 0 or greater").max(100, "Must be 100 or less"),
  updatedAt: z.any().optional(),
  updatedBy: z.string().optional(),
});

export const attendanceSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  trainerId: z.string(),
  sessionId: z.string(),
  verificationMethod: z.enum(['QR Scan', 'Admin Manual']),
  status: z.enum(['present', 'absent', 'late']),
  notes: z.string().optional(),
  timestamp: z.any().optional(), // Firebase Timestamp
});

export const paymentSessionSchema = z.object({
  id: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpayOrderId: z.string().optional(),
  // Real documents (user-app backend): keyed by Razorpay order id, state in `paymentState`,
  // `amount` in paise. `status` is a legacy field that real documents do not have.
  paymentId: z.string().optional(),
  orderId: z.string().optional(),
  paymentState: z.string().optional(),
  userId: z.string().optional(),
  amount: z.number().optional(),
  status: z.enum(['Captured', 'Failed', 'Refunded', 'Pending']).optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const ledgerSchema = z.object({
  id: z.string().optional(),
  transactionId: z.string(),
  type: z.enum(['credit', 'debit', 'refund', 'recovery']),
  amount: z.number(),
  userId: z.string(),
  description: z.string().optional(),
  status: z.enum(['success', 'failed', 'pending']),
  createdAt: z.any().optional(),
});
