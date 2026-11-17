'use client';

import { useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, query, collection, where, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Admin } from '@/types';
import { toast } from 'sonner';
import { clearSessionCookie, syncSessionCookie } from '@/lib/firebase/session';

async function getAdminData(user: User): Promise<Admin | null> {
  if (!user.email) return null;

  // 1. Direct UID Lookup
  try {
    const directDocRef = doc(db, 'admins', user.uid);
    const directSnap = await getDoc(directDocRef);
    if (directSnap.exists()) {
      const data = directSnap.data() as Admin;
      if (data.isActive !== false) return { ...data, id: directSnap.id };
    }
  } catch (e) {
    console.warn("UID direct lookup failed or non-existent, trying email query...", e);
  }

  // 2. Fallback Email Query Lookup (handles auto-generated document IDs)
  try {
    const q = query(
      collection(db, 'admins'),
      where('email', '==', user.email.toLowerCase().trim()),
      limit(1)
    );
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const adminDoc = querySnap.docs[0];
      const data = adminDoc.data() as Admin;
      if (data.isActive !== false) return { ...data, id: adminDoc.id };
    }
  } catch (e) {
    console.error("Email query lookup failed:", e);
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setAdminData, setLoading, clearAuth } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        try {
          const adminData = await getAdminData(user);
          
          if (adminData) {
            await syncSessionCookie(user).catch(() => false);
            setAdminData(adminData);
          } else {
            await signOut(auth);
            clearAuth();
            toast.error('Access Denied', {
              description: 'Your account is not registered in the admin roster.',
            });
          }
        } catch (error) {
          console.error('Error fetching admin data:', error);
          await signOut(auth);
          clearAuth();
          toast.error('Authentication Error', {
            description: 'Failed to verify admin permissions.',
          });
        }
      } else {
        clearAuth();
        await clearSessionCookie();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setAdminData, setLoading, clearAuth]);

  return <>{children}</>;
}
