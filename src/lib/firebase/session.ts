import type { User } from 'firebase/auth';

/** Mirrors the Firebase client session into a server-verified httpOnly cookie. */
export async function syncSessionCookie(user: User): Promise<boolean> {
  const idToken = await user.getIdToken(true);
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  return res.ok;
}

export async function clearSessionCookie() {
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
}
