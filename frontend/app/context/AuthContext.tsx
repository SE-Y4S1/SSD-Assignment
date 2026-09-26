'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { authService, User as AuthUser } from '../services/authService';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: Record<string, unknown> & { role: 'patient' | 'doctor' }) => Promise<AuthUser>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Defensive normalisation — backend services still return `_id`.
// The role is whatever the auth service said it is. It used to be guessed here,
// with the admin recognised by an address hard-coded into the bundle (V-A07).
const normaliseUser = (raw: any): AuthUser => {
  const u = { ...raw };
  if (u._id && !u.id) u.id = u._id;
  return u as AuthUser;
};

// The display name is the one thing kept between reloads, and it decides
// nothing. Identity and role are asked of the server every time (V-A06).
const DISPLAY_NAME_KEY = 'medsync_display_name';

const rememberDisplayName = (name?: string) => {
  if (typeof window === 'undefined' || !name) return;
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // a browser refusing storage is not a reason to fail the login
  }
};

const recallDisplayName = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const storedToken = Cookies.get('medsync_token');
      if (!storedToken) {
        // A user object left behind by an older build is not a session.
        if (typeof window !== 'undefined') localStorage.removeItem('medsync_user');
        setIsLoading(false);
        return;
      }

      // The session used to be restored from localStorage, where a script could
      // have written any id and role it liked. The token is now handed to the
      // auth service, and the identity it returns is the one used (V-A06).
      const verified = await authService.verify(storedToken);
      if (cancelled) return;

      if (!verified) {
        authService.logout();
        setIsLoading(false);
        return;
      }

      // Left over from the build that trusted it; nothing reads it now.
      if (typeof window !== 'undefined') localStorage.removeItem('medsync_user');

      setToken(storedToken);
      setUser({
        id: verified.id,
        email: verified.email,
        role: verified.role,
        name: recallDisplayName() || verified.email,
      });
      setIsLoading(false);
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authService.login(email, password);
    // token became optional when doctor registration stopped returning one
    // (V-A11). A login that succeeds always carries one, and treating a reply
    // without one as success would leave the app signed in with no token.
    if (!data.token) {
      throw new Error('Login did not return a session. Please try again.');
    }
    const u = normaliseUser(data.user);
    authService.setToken(data.token);
    rememberDisplayName(u.name);
    setToken(data.token);
    setUser(u);
    return u;
  };

  const register = async (formData: Record<string, unknown> & { role: 'patient' | 'doctor' }) => {
    const data = await authService.register(formData);
    const u = normaliseUser(data.user);
    if (!u.role) u.role = formData.role;
    // Doctors are not issued a token until an admin verifies the account
    if (data.token) {
      authService.setToken(data.token);
      rememberDisplayName(u.name);
      setToken(data.token);
      setUser(u);
    }
    return u;
  };

  const logout = () => {
    authService.logout();
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
