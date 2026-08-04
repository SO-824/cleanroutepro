import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Verify the requesting user is an admin
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Only owners and admins can invite staff' }, { status: 403 });
    }

    const body = await request.json();
    const { staffMemberId, email, name } = body;

    if (!staffMemberId || !email) {
      return NextResponse.json({ error: 'Missing staffMemberId or email' }, { status: 400 });
    }

    // Verify this staff member belongs to the admin's org
    const { data: staffMember } = await serverSupabase
      .from('staff_members')
      .select('id, org_id, invite_status')
      .eq('id', staffMemberId)
      .eq('org_id', profile.org_id)
      .single();

    if (!staffMember) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    if (staffMember.invite_status === 'accepted') {
      return NextResponse.json({ error: 'Staff member already has an account' }, { status: 400 });
    }

    // Use admin API with service role key
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Check if this email already has an account — use targeted DB lookup instead
    // of listUsers() which fetches up to 1000 users in one shot (scalability risk).
    const { data: existingUsersData } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();
    const existingUser = existingUsersData ? { id: existingUsersData.id, email: existingUsersData.email } : null;

    if (existingUser) {
      // User already has an account — just link them to this org
      // Check if they're already a member of this org
      const { data: existingMember } = await adminSupabase
        .from('org_members')
        .select('id, status')
        .eq('user_id', existingUser.id)
        .eq('org_id', profile.org_id)
        .maybeSingle();

      // An accepted membership means they're already in. A PENDING one means
      // this is a re-send — refresh the link and report success rather than
      // erroring out (the old code made "Resend invite" always fail).
      if (existingMember) {
        if (existingMember.status === 'accepted') {
          return NextResponse.json({ error: 'This person already has access to your organisation' }, { status: 400 });
        }
        const { error: relinkErr } = await adminSupabase
          .from('staff_members')
          .update({ user_id: existingUser.id, invite_status: 'pending', email })
          .eq('id', staffMemberId);
        if (relinkErr) {
          console.error('[Staff Invite] staff_members re-link failed:', relinkErr.message);
          return NextResponse.json({ error: `Failed to link staff record: ${relinkErr.message}` }, { status: 500 });
        }
        // Keep the membership pointed at this roster row in case it drifted
        await adminSupabase.from('org_members')
          .update({ staff_member_id: staffMemberId })
          .eq('id', existingMember.id);
        return NextResponse.json({
          success: true, existing: true, resent: true,
          message: 'Invitation is pending — they will see it when they log in to CleanRoute Pro',
        });
      }

      // Link the staff_members record FIRST: if this fails there is no
      // membership row yet, so there's nothing to half-create.
      const { error: linkErr } = await adminSupabase
        .from('staff_members')
        .update({ user_id: existingUser.id, invite_status: 'pending', email })
        .eq('id', staffMemberId);
      if (linkErr) {
        console.error('[Staff Invite] staff_members link failed:', linkErr.message);
        return NextResponse.json({ error: `Failed to link staff record: ${linkErr.message}` }, { status: 500 });
      }

      // Add them as a PENDING member — they must accept in-app
      const { error: memberErr } = await adminSupabase.from('org_members').insert({
        user_id: existingUser.id,
        org_id: profile.org_id,
        role: 'staff',
        staff_member_id: staffMemberId,
        status: 'pending',
      });
      if (memberErr) {
        // Roll the staff link back so the roster doesn't show a phantom invite
        await adminSupabase.from('staff_members')
          .update({ user_id: null, invite_status: 'none' })
          .eq('id', staffMemberId);
        console.error('[Staff Invite] org_members insert failed:', memberErr.message);
        return NextResponse.json({ error: `Failed to create invitation: ${memberErr.message}` }, { status: 500 });
      }

      // NOTE: no email is sent here. Supabase's inviteUserByEmail only works
      // for brand-new addresses and errors with "email_exists" for anyone who
      // already has an account — which is the only case that reaches this
      // branch. The invite is delivered in-app: it appears on their dashboard
      // the next time they log in. Don't claim an email was sent.
      return NextResponse.json({
        success: true, existing: true,
        message: 'Invitation created — they will see it when they log in to CleanRoute Pro',
      });
    }

    // New user — they need to create an account first
    return NextResponse.json({
      error: 'User not found. This person does not have an account yet. Ask them to create an account at CleanRoute Pro first, then try inviting them again.',
    }, { status: 404 });
  } catch (err) {
    console.error('[Staff Invite] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
