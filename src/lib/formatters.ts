export function formatTimestamp(timestamp: any): string {
  if (!timestamp) return 'Not provided';
  if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
  if (typeof timestamp === 'string' || typeof timestamp === 'number') return new Date(timestamp).toLocaleDateString();
  return 'Unknown Date';
}

export function formatAvailability(availability: Record<string, string[]> | undefined): { pattern: string; times: string }[] {
  if (!availability || Object.keys(availability).length === 0) return [];
  return Object.entries(availability).map(([pattern, times]) => {
    return {
      pattern,
      times: Array.isArray(times) ? times.join(', ') : 'Not specified',
    };
  });
}

export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return 'Not provided';
  if (amount === 0) return 'Free';
  return `₹${amount.toLocaleString('en-IN')}`;
}
