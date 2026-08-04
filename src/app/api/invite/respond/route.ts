import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { membershipId, action } = await request.json();
    if (!membershipId || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Verify the membership belongs to this user (RLS-scoped session client)
    const { data: membership } = await supabase
      .from('org_members')
      .select('id, org_id, role, staff_member_id, status')
      .eq('id', membershipId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (membership.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation already responded to' }, { status: 400 });
    }

    // The writes must run with the service role: at accept time the invitee's
    // profile doesn't belong to the inviting org yet, so RLS silently blocks
    // their update of the org's staff_members row (0 rows affected) — leaving
    // the invite half-accepted ("No account" on the admin side, and a remove
    // that can't revoke access).
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    if (action === 'accept') {
      // The staff row must still be live: an admin may have archived or
      // deleted them after sending the invite, and accepting into an archived
      // roster row would grant an "archived" member full access.
      if (membership.staff_member_id) {
        const { data: staffRow } = await admin
          .from('staff_members').select('id, archived')
          .eq('id', membership.staff_member_id).maybeSingle();
        if (!staffRow || staffRow.archived) {
          await admin.from('org_members').delete().eq('id', membershipId);
          return NextResponse.json(
            { error: 'This invitation is no longer valid — ask your administrator to re-invite you.' },
            { status: 410 });
        }
      }

      // Accept: flip the membership — CONDITIONAL on it still being pending so
      // a concurrent removal can't be silently undone (a 0-row update returns
      // no error, so we assert on the returned rows instead).
      const { data: flipped, error: statusErr } = await admin.from('org_members')
        .update({ status: 'accepted' })
        .eq('id', membershipId)
        .eq('status', 'pending')
        .select('id');
      if (statusErr) {
        console.error('[Invite Respond] membership accept failed:', statusErr.message);
        return NextResponse.json({ error: `Failed to accept invitation: ${statusErr.message}` }, { status: 500 });
      }
      if (!flipped || flipped.length === 0) {
        return NextResponse.json(
          { error: 'This invitation is no longer available — it may have been withdrawn.' },
          { status: 409 });
      }

      // Link + mark the staff record (user_id set here too, in case the
      // invite-time link never landed). On failure, put the invite back to
      // pending so it reappears and can be retried.
      if (membership.staff_member_id) {
        const { error: staffErr } = await admin.from('staff_members')
          .update({ invite_status: 'accepted', user_id: user.id })
          .eq('id', membership.staff_member_id);
        if (staffErr) {
          await admin.from('org_members').update({ status: 'pending' }).eq('id', membershipId);
          console.error('[Invite Respond] staff link failed:', staffErr.message);
          return NextResponse.json({ error: `Failed to link staff record: ${staffErr.message}` }, { status: 500 });
        }
      }

      // Set this as the user's active org
      const { error: profileErr } = await admin.from('profiles').update({
        org_id: membership.org_id,
        role: membership.role,
      }).eq('id', user.id);
      if (profileErr) {
        // Roll the whole accept back so the invite can be retried cleanly
        await admin.from('org_members').update({ status: 'pending' }).eq('id', membershipId);
        if (membership.staff_member_id) {
          await admin.from('staff_members')
            .update({ invite_status: 'pending' })
            .eq('id', membership.staff_member_id);
        }
        console.error('[Invite Respond] profile switch failed:', profileErr.message);
        return NextResponse.json({ error: `Failed to switch organisation: ${profileErr.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'accepted', orgId: membership.org_id });
    } else {
      // Decline: delete the membership
      await admin.from('org_members').delete().eq('id', membershipId);

      // Reset staff_member invite
      if (membership.staff_member_id) {
        await admin.from('staff_members')
          .update({ user_id: null, invite_status: 'none' })
          .eq('id', membership.staff_member_id);
      }

      // If their active org had been pointed at the declined org (e.g. via a
      // stale switch), detach so declining can't leave ghost access behind.
      await admin.from('profiles')
        .update({ org_id: null })
        .eq('id', user.id)
        .eq('org_id', membership.org_id);

      return NextResponse.json({ success: true, action: 'declined' });
    }
  } catch (err) {
    console.error('[Invite Respond] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
