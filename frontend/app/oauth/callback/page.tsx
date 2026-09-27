'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../../services/authService';

/**
 * Where the auth service lands the browser after a successful Google sign-in.
 *
 * The token arrives in the query string because this is a redirect from another
 * origin, so the first thing this page does is store it and strip it out of the
 * address bar, before anything can be shared, bookmarked or logged with the
 * token still in it. The identity is then taken from the server, the same way
 * every other session is since V-A06, rather than from anything in the URL.
 */
export default function OAuthCallbackPage() {
    const router = useRouter();
    const ran = useRef(false);
    const [message, setMessage] = useState('Completing sign-in...');

    useEffect(() => {
        // Effects run twice in development; the token is consumed once.
        if (ran.current) return;
        ran.current = true;

        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const next = params.get('next') || '/patient';

        if (!token) {
            router.replace('/login?error=invalid_response');
            return;
        }

        // Remove the token from the address bar before doing anything else.
        window.history.replaceState({}, '', '/oauth/callback');

        (async () => {
            authService.setToken(token);
            const verified = await authService.verify(token);
            if (!verified) {
                authService.logout();
                router.replace('/login?error=verification_failed');
                return;
            }
            setMessage('Signed in. Taking you to your dashboard...');
            // A full navigation so the session is read back through the normal
            // path, including the server-side route guard.
            window.location.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/patient');
        })();
    }, [router]);

    return (
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#475569', fontSize: '0.95rem' }}>{message}</p>
        </div>
    );
}
