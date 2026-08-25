import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // profiles.role/org_id are column-locked to the server — session clients
    // can no longer write them
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { name, staff, clients } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Organisation name is required' }, { status: 400 });

    // Create organisation
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: name.trim() })
      .select('id')
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: orgError?.message || 'Failed to create organisation' }, { status: 500 });
    }

    // Link user to org as owner. Both linking writes are checked and rolled
    // back on failure — an unchecked failure here is what produces an account
    // that "has an org" with no membership row (invisible in Accounts & Access
    // and unrevokable).
    const { error: profileErr } = await admin.from('profiles').update({
      org_id: org.id,
      role: 'owner',
      full_name: user.user_metadata?.full_name || '',
      onboarding_completed: true,
    }).eq('id', user.id);

    if (profileErr) {
      await supabase.from('organizations').delete().eq('id', org.id);
      console.error('[Create Org] profile link failed:', profileErr.message);
      return NextResponse.json({ error: `Failed to link your account: ${profileErr.message}` }, { status: 500 });
    }

    // Create org membership
    const { error: memberErr } = await supabase.from('org_members').insert({
      user_id: user.id,
      org_id: org.id,
      role: 'owner',
      status: 'accepted',
    });

    if (memberErr) {
      await admin.from('profiles').update({ org_id: null }).eq('id', user.id);
      await supabase.from('organizations').delete().eq('id', org.id);
      console.error('[Create Org] membership insert failed:', memberErr.message);
      return NextResponse.json({ error: `Failed to create membership: ${memberErr.message}` }, { status: 500 });
    }

    // Add staff members if provided
    if (staff && Array.isArray(staff) && staff.length > 0) {
      const staffInserts = staff
        .filter((s: { name: string }) => s.name?.trim())
        .map((s: { name: string; email?: string; role?: string }) => ({
          org_id: org.id,
          name: s.name.trim(),
          email: s.email?.trim() || null,
          role: s.role || 'cleaner',
        }));
      if (staffInserts.length > 0) {
        await supabase.from('staff_members').insert(staffInserts);
      }
    }

    // Add clients if provided
    if (clients && Array.isArray(clients) && clients.length > 0) {
      const clientInserts = clients
        .filter((c: { name: string }) => c.name?.trim())
        .map((c: { name: string; address?: string; lat?: number; lng?: number; placeId?: string }) => ({
          org_id: org.id,
          name: c.name.trim(),
          address: c.address || '',
          lat: c.lat || 0,
          lng: c.lng || 0,
          place_id: c.placeId || null,
        }));
      if (clientInserts.length > 0) {
        await supabase.from('clients').insert(clientInserts);
      }
    }

    return NextResponse.json({ success: true, orgId: org.id });
  } catch (err) {
    console.error('[Create Org] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
