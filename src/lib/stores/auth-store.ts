import { create } from 'zustand';
import { User } from 'firebase/auth';
import { Admin } from '@/types';

interface AuthState {
  user: User | null;
  adminData: Admin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setAdminData: (adminData: Admin | null) => void;
  setLoading: (isLoading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  adminData: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setAdminData: (adminData) => set({ adminData }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => set({ user: null, adminData: null, isAuthenticated: false, isLoading: false }),
}));
