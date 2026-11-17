import { TrainerTier } from "@/types";

export function resolveTrainerTierName(tierValue: string | undefined | null, allTiers: TrainerTier[] | undefined): string {
  if (!tierValue) return "Standard";
  if (!allTiers || allTiers.length === 0) return tierValue; // Cannot resolve, assume it's already a name or fallback
  
  // Try to find by ID first
  const tierById = allTiers.find(t => t.id === tierValue);
  if (tierById) return tierById.name;
  
  // Return original value if it doesn't match an ID (it might already be a name like "Gold")
  return tierValue;
}
