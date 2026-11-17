import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type AdminAuthResult =
  | { error: string; uid?: undefined; adminData?: undefined }
  | { uid: string; adminData: Record<string, unknown>; error?: undefined };

const DENIED = "You don't have permission to manage the admin panel.";

/** Looks up the admin roster entry for a user (by uid, then by email) and checks role + active flag. */
export async function getAdminRecord(uid: string, email?: string) {
  const db = getAdminDb();
  let snap = await db.collection('admins').doc(uid).get();
  if (!snap.exists && email) {
    const q = await db
      .collection('admins')
      .where('email', '==', email.toLowerCase().trim())
      .limit(1)
      .get();
    if (!q.empty) snap = q.docs[0];
  }
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.isActive === false) return null;
  if (data.role !== 'admin' && data.role !== 'superadmin') return null;
  return { id: snap.id, ...data } as Record<string, unknown>;
}

/** Verifies the request's bearer ID token and confirms the caller has an admin/superadmin role. */
export async function authenticateAdmin(request: Request): Promise<AdminAuthResult> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized: No token provided' };
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const adminData = await getAdminRecord(decoded.uid, decoded.email);
    if (!adminData) return { error: DENIED };
    return { uid: decoded.uid, adminData };
  } catch {
    return { error: 'Unauthorized: Invalid token' };
  }
}
