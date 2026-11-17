import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/firebase/admin-auth';

// Server-side gate for the dashboard. Firestore rules remain the real data boundary.
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    try {
      await getAdminAuth().verifySessionCookie(cookie);
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }
  const login = new URL('/login', request.url);
  const res = NextResponse.redirect(login);
  if (cookie) res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
