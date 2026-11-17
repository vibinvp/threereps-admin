import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import {
  getAdminRecord,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from '@/lib/firebase/admin-auth';

/** Exchanges a Firebase ID token for an httpOnly session cookie (admins only). */
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (typeof idToken !== 'string' || !idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    const admin = await getAdminRecord(decoded.uid, decoded.email);
    if (!admin) {
      return NextResponse.json({ error: 'Not an admin' }, { status: 403 });
    }
    const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
