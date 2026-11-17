// Keep ADMIN_ROLES in sync with functions/index.js. Client checks only hide UI;
// Cloud Functions (requireRole) and Firestore rules are the real enforcement.
export const ADMIN_ROLES = ['superadmin', 'admin', 'ops', 'finance', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role);
}

const ALL: AdminRole[] = [...ADMIN_ROLES];

/** Which roles may open each dashboard section (superadmin always can). */
export const ROUTE_ROLES: Record<string, AdminRole[]> = {
  '/dashboard': ALL,
  '/dashboard/bookings': ['admin', 'ops', 'finance', 'support'],
  '/dashboard/bookings/new': ['admin', 'ops'],
  '/dashboard/attendance': ['admin', 'ops'],
  '/dashboard/trainers': ['admin', 'ops'],
  '/dashboard/trainer-tiers': ['admin'],
  '/dashboard/users': ['admin', 'ops', 'support'],
  '/dashboard/payments': ['admin', 'finance'],
  '/dashboard/ledger': ['admin', 'finance'],
  '/dashboard/support': ['admin', 'ops', 'support'],
  '/dashboard/notifications': ['admin', 'ops'],
  '/dashboard/banners': ['admin', 'ops'],
  '/dashboard/categories': ['admin', 'ops'],
  '/dashboard/languages': ['admin', 'ops'],
  '/dashboard/service-areas': ['admin', 'ops'],
  '/dashboard/landing-page': ['admin'],
  '/dashboard/cms': ['admin'],
  '/dashboard/legal': ['admin'],
  '/dashboard/audit-logs': ['admin'],
  '/dashboard/settings': ['admin'],
};

export function canAccess(role: string | undefined | null, href: string): boolean {
  if (role === 'superadmin') return true;
  if (!isAdminRole(role)) return false;
  // Longest matching prefix wins.
  const key = Object.keys(ROUTE_ROLES)
    .filter((k) => href === k || href.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return key ? ROUTE_ROLES[key].includes(role) : false;
}
