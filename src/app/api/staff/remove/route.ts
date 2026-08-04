import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/staff/remove
 *
 * Body: { staffMemberId: string, revokeAccountOnly?: boolean }
 *
 * - If revokeAccountOnly=true: removes the staff member's access to this org
 *   (deletes org_members row, resets staff_members.invite_status + user_id)
 *   but keeps the staff_members record so they stay in the roster.
 *
 * - If revokeAccountOnly=false (default): also deletes the staff_members record
 *   from the roster entirely.
 *
 * In both cases, if the user has no remaining org memberships after removal,
 * their profile is detached (org_id cleared) so they see the welcome screen.
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
      return NextResponse.json({ error: 'Only the owner can remove staff' }, { status: 403 });
    }

    const body = await request.json();
    const { staffMemberId, revokeAccountOnly = false } = body;

    if (!staffMemberId) {
      return NextResponse.json({ error: 'Missing staffMemberId' }, { status: 400 });
    }

    // Fetch the staff member — must belong to this org
    const { data: staffMember } = await serverSupabase
      .from('staff_members')
      .select('id, org_id, user_id, invite_status, name, email')
      .eq('id', staffMemberId)
      .eq('org_id', profile.org_id)
      .single();

    if (!staffMember) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // ── Resolve the linked login. staff_members.user_id alone is NOT enough:
    // a half-completed invite can leave the account reachable only via the
    // org_members link or the profile email — and a removal that misses it
    // leaves the person with full org access.
    let linkedUserId: string | null = staffMember.user_id;
    if (!linkedUserId) {
      const { data: om } = await adminSupabase
        .from('org_members')
        .select('user_id')
        .eq('staff_member_id', staffMemberId)
        .eq('org_id', profile.org_id)
        .maybeSingle();
      linkedUserId = om?.user_id || null;
    }
    if (!linkedUserId && staffMember.email) {
      const { data: p } = await adminSupabase
        .from('profiles')
        .select('id')
        .ilike('email', staffMember.email)
        .eq('org_id', profile.org_id)
        .maybeSingle();
      linkedUserId = p?.id || null;
    }

    // ── 1. Remove org_members rows (revokes portal access) — matched both by
    // staff link and by user id so half-linked rows can't survive ───────────
    await adminSupabase
      .from('org_members')
      .delete()
      .eq('staff_member_id', staffMemberId)
      .eq('org_id', profile.org_id);

    if (linkedUserId) {
      await adminSupabase
        .from('org_members')
        .delete()
        .eq('user_id', linkedUserId)
        .eq('org_id', profile.org_id);

      // ── 2. Reset the staff_members invite fields ─────────────────────────
      await adminSupabase
        .from('staff_members')
        .update({ user_id: null, invite_status: null })
        .eq('id', staffMemberId);

      // ── 3. Check remaining ACCEPTED memberships ──────────────────────────
      // Pending invites don't count — auto-switching into one would drop the
      // user inside an org they never accepted.
      const { data: remainingMemberships } = await adminSupabase
        .from('org_members')
        .select('id, org_id, role')
        .eq('user_id', linkedUserId)
        .eq('status', 'accepted');

      const hasOtherOrgs = (remainingMemberships || []).length > 0;

      // ── 4. Repoint the profile — only if it currently points at THIS org,
      // so a user active elsewhere isn't yanked out of that org.
      const { data: targetProfile } = await adminSupabase
        .from('profiles').select('org_id').eq('id', linkedUserId).single();

      if (targetProfile?.org_id === profile.org_id) {
        if (!hasOtherOrgs) {
          // Clear org_id so the user lands on the welcome screen on next login.
          // NOTE: role stays — profiles.role is NOT NULL; writing null here made
          // the whole detach silently fail, leaving removed staff with access.
          const { error: detachErr } = await adminSupabase
            .from('profiles')
            .update({ org_id: null })
            .eq('id', linkedUserId);
          if (detachErr) {
            console.error('[Staff Remove] detach failed:', detachErr.message);
            return NextResponse.json({ error: `Access was not fully revoked: ${detachErr.message}` }, { status: 500 });
          }
        } else {
          // Auto-switch to another org they still belong to
          const next = remainingMemberships![0];
          const { error: switchErr } = await adminSupabase
            .from('profiles')
            .update({ org_id: next.org_id, role: next.role })
            .eq('id', linkedUserId);
          if (switchErr) {
            console.error('[Staff Remove] org switch failed:', switchErr.message);
            return NextResponse.json({ error: `Access was not fully revoked: ${switchErr.message}` }, { status: 500 });
          }
        }
      }
    }

    // ── 5. Optionally delete the staff_members row entirely ─────────────────
    if (!revokeAccountOnly) {
      // Clean up foreign keys before deleting
      await adminSupabase.from('staff_assignments').delete().eq('staff_id', staffMemberId);
      await adminSupabase.from('schedules').update({ driver_staff_id: null }).eq('driver_staff_id', staffMemberId);
      await adminSupabase.from('org_members').delete().eq('staff_member_id', staffMemberId);
      
      const { error: delErr } = await adminSupabase.from('staff_members').delete().eq('id', staffMemberId);
      if (delErr) {
        console.error('Error deleting staff member:', delErr);
        return NextResponse.json({ error: 'Failed to delete staff member. ' + delErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      revokedAccountOnly: revokeAccountOnly,
      accountDetached: !!linkedUserId,
    });
  } catch (err) {
    console.error('[Staff Remove] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
