import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/staff/remove-org-member
 *
 * Revokes an org_members row directly by its ID.
 * Used for revoking accounts from the Accounts & Access tab where the
 * account holder may be an admin (not in staff_members) or a staff member
 * whose staff_member_id link needs to be reset.
 *
 * Body: { membershipId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can revoke access' }, { status: 403 });
    }

    const body = await request.json();
    const { membershipId } = body;

    if (!membershipId) {
      return NextResponse.json({ error: 'Missing membershipId' }, { status: 400 });
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch the membership — must belong to this org
    const { data: membership } = await adminSupabase
      .from('org_members')
      .select('id, user_id, org_id, role, staff_member_id')
      .eq('id', membershipId)
      .eq('org_id', profile.org_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    }

    // Prevent revoking yourself
    if (membership.user_id === user.id) {
      return NextResponse.json({ error: 'You cannot revoke your own access' }, { status: 400 });
    }

    const linkedUserId = membership.user_id;

    // ── 1. Delete the org_members row ────────────────────────────────────
    await adminSupabase.from('org_members').delete().eq('id', membershipId);

    // ── 2. If linked to a staff_member, reset their invite fields ────────
    if (membership.staff_member_id) {
      await adminSupabase
        .from('staff_members')
        .update({ user_id: null, invite_status: null })
        .eq('id', membership.staff_member_id);
    }

    // ── 3. Check remaining ACCEPTED memberships for this user ────────────
    // Pending invites must not count: auto-switching into one would drop the
    // user inside an org they never accepted.
    const { data: remaining } = await adminSupabase
      .from('org_members')
      .select('id, org_id, role')
      .eq('user_id', linkedUserId)
      .eq('status', 'accepted');

    const hasOtherOrgs = (remaining || []).length > 0;

    // ── 4. Repoint the profile — only if it currently points at THIS org.
    // Someone whose active org is elsewhere must not be yanked out of it.
    const { data: targetProfile } = await adminSupabase
      .from('profiles').select('org_id').eq('id', linkedUserId).single();

    if (targetProfile?.org_id === profile.org_id) {
      if (!hasOtherOrgs) {
        // Clear org_id so the user lands on the welcome screen on next login.
        // role is NOT NULL — writing null aborts the whole update and silently
        // leaves the revoked user with full org access.
        const { error: detachErr } = await adminSupabase
          .from('profiles')
          .update({ org_id: null })
          .eq('id', linkedUserId);
        if (detachErr) {
          console.error('[Remove Org Member] detach failed:', detachErr.message);
          return NextResponse.json({ error: `Access was not fully revoked: ${detachErr.message}` }, { status: 500 });
        }
      } else {
        // Auto-switch to another org they still belong to
        const next = remaining![0];
        const { error: switchErr } = await adminSupabase
          .from('profiles')
          .update({ org_id: next.org_id, role: next.role })
          .eq('id', linkedUserId);
        if (switchErr) {
          console.error('[Remove Org Member] org switch failed:', switchErr.message);
          return NextResponse.json({ error: `Access was not fully revoked: ${switchErr.message}` }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, accountDetached: !hasOtherOrgs });
  } catch (err) {
    console.error('[Remove Org Member] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
