import Cookies from 'js-cookie';

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:5000/api/auth';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'patient' | 'doctor' | 'admin';
}

export interface VerifiedIdentity {
  id: string;
  email: string;
  role: User['role'];
}

export interface AuthResponse {
  user: User;
  token?: string;
  message?: string;
}

const parseError = async (response: Response, fallback: string) => {
  try {
    const error = await response.json();
    return error?.message || fallback;
  } catch {
    return fallback;
  }
};

export const authService = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await parseError(response, 'Login failed'));
    return response.json();
  },

  register: async (userData: unknown): Promise<AuthResponse> => {
    const response = await fetch(`${AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!response.ok) throw new Error(await parseError(response, 'Registration failed'));
    return response.json();
  },

  // Asks the auth service to decode the token and say who it belongs to.
  // The identity used for any decision has to come from here, not from a
  // copy the browser kept (V-A06).
  verify: async (token: string): Promise<VerifiedIdentity | null> => {
    try {
      const response = await fetch(`${AUTH_URL}/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.valid || !data.user) return null;
      const claims = data.user;
      const id = claims.userId || claims.id || claims.patientId || claims.doctorId;
      if (!id || !claims.role) return null;
      return { id, email: claims.email, role: claims.role };
    } catch {
      return null;
    }
  },

  logout: () => {
    Cookies.remove('medsync_token');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('medsync_user');
      localStorage.removeItem('medsync_display_name');
    }
  },

  setToken: (token: string) => {
    Cookies.set('medsync_token', token, {
      // Matches the 12 hour token lifetime instead of outliving it by days.
      expires: 0.5,
      // Strict, so the cookie is not attached to requests started by another
      // site, and Secure whenever the page itself is served over https
      // rather than only when NODE_ENV happens to say production (V-A04).
      sameSite: 'strict',
      secure:
        typeof window !== 'undefined' && window.location.protocol === 'https:',
    });
  },

  getToken: () => Cookies.get('medsync_token'),

  isAuthenticated: () => !!Cookies.get('medsync_token'),
};
