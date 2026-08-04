import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Support both PKCE (token_hash) and implicit (code) flows
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard/schedule';

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');
  redirectTo.searchParams.delete('code');
  redirectTo.searchParams.delete('next');

  const supabase = await createClient();

  // PKCE flow — token hash exchange
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error && data?.user) {
      const user = data.user;

      // NOTE: this route used to auto-accept an org invite from stale auth
      // metadata (staff_member_id + org_id) — joining the user to an org
      // without consent, and doing it with writes that RLS silently blocked,
      // which left the badges mismatched. Accepting is now exclusively the
      // in-app flow (/api/invite/respond), which verifies ownership, checks
      // every write, and can be declined. Nothing to sync here.

      const { data: profile } = await supabase.from('profiles').select('role, org_id').eq('id', user.id).maybeSingle();
      if (!profile?.org_id) {
        redirectTo.pathname = '/dashboard';
      } else if (profile?.role === 'staff') {
        redirectTo.pathname = '/dashboard/staff-view';
      } else {
        redirectTo.pathname = '/dashboard/schedule';
      }
      return NextResponse.redirect(redirectTo);
    }
  }

  // Implicit / OAuth flow — code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  // Something went wrong — send back to login with error
  redirectTo.pathname = '/login';
  redirectTo.searchParams.set('error', 'auth_callback_failed');
  return NextResponse.redirect(redirectTo);
}
