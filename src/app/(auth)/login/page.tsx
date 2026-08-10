'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import BrandMark from '@/components/BrandMark';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError(authError.message); setLoading(false); return; }
    router.push('/dashboard/schedule');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-[420px]">
        <div className="card-elevated p-8">
          <div className="text-center mb-8">
            <BrandMark size={56} className="mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-text-primary">CleanRoute Pro</h1>
            <p className="text-sm text-text-secondary mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="input-field" placeholder="you@company.com" required />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text-secondary">Password</label>
                <a href="/forgot-password" className="text-xs text-primary font-medium hover:underline">
                  Forgot password?
                </a>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="input-field" placeholder="••••••••" required />
            </div>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-sm text-danger bg-danger-light rounded-lg p-3">{error}</motion.div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-text-tertiary mt-6">
            Don&apos;t have an account?{' '}
            <a href="/register" className="text-primary font-medium hover:underline">Create one</a>
          </p>
          <p className="text-center text-xs text-text-tertiary mt-3">
            New here?{' '}
            <a href="/help" className="text-primary font-medium hover:underline">Read the guides</a>
            {' '}— no account needed
          </p>
        </div>
      </motion.div>
    </div>
  );
}
