'use client';

import React, { useState, useEffect } from 'react';
import { MedCard as Card, MedInput as Input, MedButton as Button, showToast } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock } from 'lucide-react';

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:5000/api/auth';

// The callback redirects here with ?error=<reason> when a sign-in does not
// complete. The reasons are deliberately coarse: they say enough to act on
// without reporting which check failed.
const OAUTH_ERRORS: Record<string, string> = {
    access_denied: 'You cancelled the Google sign-in.',
    account_exists: 'An account already uses that email address. Sign in with your password first, then link Google from your profile.',
    invalid_state: 'That sign-in link has already been used or has expired. Please try again.',
    verification_failed: 'Google sign-in could not be verified. Please try again.',
    oauth_not_configured: 'Google sign-in is not enabled on this deployment.',
};


export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, user } = useAuth();
    const router = useRouter();

    // Surface a failed Google sign-in rather than dropping the person back on a
    // blank login form with no explanation.
    useEffect(() => {
        const reason = new URLSearchParams(window.location.search).get('error');
        if (!reason) return;
        showToast(OAUTH_ERRORS[reason] || 'Google sign-in did not complete. Please try again.', 'error');
        window.history.replaceState({}, '', '/login');
    }, []);

    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            if (user.role === 'admin') router.push('/admin');
            else if (user.role === 'doctor') router.push('/doctor');
            else router.push('/patient');
        }
    }, [user, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const loggedInUser = await login(email, password);
            showToast(`Welcome back, ${loggedInUser.name}!`, 'success');
            
            // Redirection logic handled by useEffect above, but we can do it here for speed
            if (loggedInUser.role === 'admin') router.push('/admin');
            else if (loggedInUser.role === 'doctor') router.push('/doctor');
            else router.push('/patient');
            
        } catch (err: any) {
            showToast(err.message || 'Login failed. Please check your credentials.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-wrapper">
            <style jsx>{`
                .login-wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 90vh;
                    background: #f8fafc;
                }
                .login-container {
                    width: 100%;
                    max-width: 400px;
                    padding: 20px;
                }
                .login-header {
                    text-align: center;
                    margin-bottom: 32px;
                }
                .login-header h2 {
                    font-size: 1.8rem;
                    font-weight: 800;
                    color: #0f172a;
                    margin-bottom: 8px;
                }
                .login-header p {
                    color: #64748b;
                    font-size: 0.95rem;
                }
            `}</style>

            <div className="login-container">
                <div className="login-header">
                    <h2>Welcome Back</h2>
                    <p>Enter your credentials to access your dashboard</p>
                </div>

                <Card title="Sign In" icon={<Lock size={20} />}>
                    <form onSubmit={handleSubmit} style={{ padding: '8px 4px' }}>
                        <Input 
                            label="Email Address" 
                            type="email" 
                            placeholder="name@company.com"
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                        <Input 
                            label="Password" 
                            type="password" 
                            placeholder="••••••••"
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                        
                        <Button 
                            type="submit" 
                            className="primary" 
                            disabled={loading} 
                            style={{ width: '100%', marginTop: '24px', padding: '12px', fontSize: '1rem' }}
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0 16px' }}>
                        <span style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>or</span>
                        <span style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    </div>

                    {/* Starts the authorization code flow on the auth service. The
                        browser never holds the client secret or the code verifier. */}
                    <a
                        href={`${AUTH_URL}/oauth/google`}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                            width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px',
                            textDecoration: 'none', color: '#1e293b', fontWeight: 600, fontSize: '0.95rem',
                            background: '#fff',
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                        Continue with Google
                    </a>

                    <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
                            New to MedSync? <Link href="/register" style={{ color: '#0ea5e9', fontWeight: 600, textDecoration: 'none' }}>Create an account</Link>
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
