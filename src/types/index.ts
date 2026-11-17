import { z } from 'zod';
import {
  adminSchema,
  userSchema,
  trainerSchema,
  bookingSchema,
  categorySchema,
  trainerTierSchema,
  attendanceSchema,
  paymentSessionSchema,
  ledgerSchema,
  sessionPatternSchema,
} from '@/lib/validations';

export type Admin = z.infer<typeof adminSchema>;
export type User = z.infer<typeof userSchema>;
export type Trainer = z.infer<typeof trainerSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type Category = z.infer<typeof categorySchema>;
export type TrainerTier = z.infer<typeof trainerTierSchema>;
export type Attendance = z.infer<typeof attendanceSchema>;
export type PaymentSession = z.infer<typeof paymentSessionSchema>;
export type Ledger = z.infer<typeof ledgerSchema>;
export type SessionPattern = z.infer<typeof sessionPatternSchema>;
