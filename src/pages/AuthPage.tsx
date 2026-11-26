import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { apiFetch, setSessionToken } from '../lib/api';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '../lib/timezone';
import type { AuthUser } from '../lib/types';

interface AuthPageProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'claim'>('login');
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [adminEmailHint, setAdminEmailHint] = useState('mainajecinta81@gmail.com');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('Kenya');
  const [timezone, setTimezone] = useState(detectBrowserTimezone());
  const [currency, setCurrency] = useState('KES');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ needsAdminSetup: boolean; adminEmailHint: string }>('/api/auth/status')
      .then((res) => {
        setNeedsAdminSetup(res.needsAdminSetup);
        setAdminEmailHint(res.adminEmailHint);
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSessionToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          phone,
          country,
          timezone,
          preferredCurrency: currency,
        }),
      });
      setSessionToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({
          password,
          fullName: fullName || 'Jecinta Maina',
          timezone,
        }),
      });
      setSessionToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not set up admin account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      {needsAdminSetup && mode !== 'claim' && (
        <div className="mb-6 rounded-xl border border-[#D6B15C] bg-[#FAF3E6] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9A6D14]" />
              <div>
                <p className="text-sm font-semibold text-[#0F213E]">
                  First-Run Teacher / Admin Setup Available
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                  Set the initial password for Super Admin ({adminEmailHint}) to claim your
                  teaching dashboard.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode('claim');
                setError('');
              }}
              className="rounded-lg bg-[#0F213E] px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0"
            >
              Claim Admin
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#E5DFD3] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-1 rounded-lg bg-[#F4F0E8] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              mode === 'login' ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              mode === 'register' ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
            }`}
          >
            Parent Registration
          </button>
          {needsAdminSetup && (
            <button
              type="button"
              onClick={() => {
                setMode('claim');
                setError('');
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                mode === 'claim' ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
              }`}
            >
              Admin Setup
            </button>
          )}
        </div>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
                Welcome back to Jey Learning Hub
              </h1>
              <p className="mt-1 text-sm text-[#475569]">
                Sign in with your parent, student, teacher, or administrator account.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] bg-white px-3.5 py-2.5 text-sm text-[#0F213E] focus:border-[#0F213E] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] bg-white px-3.5 py-2.5 text-sm text-[#0F213E] focus:border-[#0F213E] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F213E] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1B355E] disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {loading ? 'Signing in...' : 'Sign In to Portal'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegisterParent} className="mt-6 space-y-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
                Create a Parent Account
              </h1>
              <p className="mt-1 text-sm text-[#475569]">
                Manage one or multiple children, book lessons in your timezone, and track progress.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[#0F213E]">Parent Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F213E]">Phone / WhatsApp</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254..."
                  className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-[#0F213E]">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F213E]">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  {Array.from(new Set([timezone, ...COMMON_TIMEZONES])).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F213E]">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">
                Password (min. 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F213E] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1B355E] disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {loading ? 'Creating account...' : 'Create Parent Account'}
            </button>
          </form>
        )}

        {mode === 'claim' && needsAdminSetup && (
          <form onSubmit={handleClaimAdmin} className="mt-6 space-y-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
                Claim Super Admin Account
              </h1>
              <p className="mt-1 text-sm text-[#475569]">
                Account: <span className="font-medium text-[#0F213E]">{adminEmailHint}</span>.
                Choose a secure password to activate Jecinta Maina’s teaching &amp; admin console.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">Teacher Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jecinta Maina"
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">Teaching Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
              >
                {Array.from(new Set([timezone, 'Africa/Nairobi', ...COMMON_TIMEZONES])).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F213E]">
                Admin Password (min. 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F213E] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1B355E]"
            >
              <Lock className="h-4 w-4" />
              {loading ? 'Activating...' : 'Activate Super Admin Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
