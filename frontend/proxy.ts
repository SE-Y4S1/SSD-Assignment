import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Reached from the server this runs on, not from the browser, so it is not a
// NEXT_PUBLIC_ value and nothing about it is sent to the client.
const AUTH_URL = process.env.AUTH_SERVICE_INTERNAL_URL || 'http://localhost:5000/api/auth';

// Which roles may see which part of the application. The same table is applied
// in the layout; this copy is the one the browser cannot skip.
const ALLOWED_PREFIXES: Record<string, string[]> = {
  admin: ['/admin'],
  doctor: ['/doctor', '/telemedicine'],
  patient: ['/patient', '/appointment', '/symptom-checker', '/telemedicine', '/payment'],
};

const HOME_FOR_ROLE: Record<string, string> = {
  admin: '/admin',
  doctor: '/doctor',
  patient: '/patient',
};

const PROTECTED_PREFIXES = [
  '/admin', '/doctor', '/patient', '/appointment',
  '/telemedicine', '/symptom-checker', '/payment',
];

const toLogin = (request: NextRequest, pathname: string) => {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  const response = NextResponse.redirect(loginUrl);
  // A token that did not verify is not worth keeping.
  response.cookies.delete('medsync_token');
  return response;
};

/**
 * The guard used to accept any request that carried a cookie called
 * medsync_token, whatever was in it, and it checked nothing about the role. A
 * cookie a script had written was enough to reach /admin, and the page then
 * rendered and started fetching (V-A06).
 *
 * The token is now verified by the auth service before the page is served, and
 * the role in it has to match the part of the application being asked for.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get('medsync_token')?.value;
  if (!token) return toLogin(request, pathname);

  let claims: { role?: string } | null = null;
  try {
    const response = await fetch(`${AUTH_URL}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.valid && data.user) claims = data.user;
    }
  } catch {
    // Unreachable auth service. Fall through to the refusal below: a protected
    // page is not served on the strength of a token nobody has checked.
    claims = null;
  }

  if (!claims?.role) return toLogin(request, pathname);

  const allowed = ALLOWED_PREFIXES[claims.role] || [];
  if (!allowed.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.redirect(new URL(HOME_FOR_ROLE[claims.role] || '/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/doctor/:path*',
    '/patient/:path*',
    '/appointment/:path*',
    '/telemedicine/:path*',
    '/symptom-checker/:path*',
    '/payment/:path*',
  ],
};
