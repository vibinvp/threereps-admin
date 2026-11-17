import { redirect } from "next/navigation";

// This page used to write trainer tier documents in a shape ({name, price,
// durationDays, features}) that is incompatible with the real trainer_tiers
// schema used by /dashboard/trainer-tiers and the mobile apps
// ({commissionRate, position, badgeColor, pricing.trial/subscriptions, ...}).
// Editing a tier here would silently corrupt the document the real UI reads.
export default function LegacyTierSettingsRedirect() {
  redirect("/dashboard/trainer-tiers");
}
