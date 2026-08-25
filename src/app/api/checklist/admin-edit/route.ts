import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ChecklistSection, migrateOldSection } from '@/components/checklist/types';

/**
 * POST /api/checklist/admin-edit
 *
 * Owner/admin corrections on a SUBMITTED checklist:
 *   { completionId, toggles?: [{ fieldId, value }], notes?: string }
 *
 * - toggles may only target checkbox fields — the template is the authority,
 *   so typed answers can't be altered through this route.
 * - notes replaces the staff notes verbatim (empty string clears them).
 * - The database RPC preserves the pre-edit originals on first edit and
 *   stamps admin_edited_at/by; the submitted-lock stays closed to all
 *   other writers.
 */

export async function POST(request: NextRequest) {
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase
      .from('profiles').select('org_id, role').eq('id', user.id).single();
    if (!profile?.org_id || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Only owners and admins can edit submitted checklists' }, { status: 403 });
    }

    const body = await request.json();
    const { completionId, toggles, notes } = body as {
      completionId?: string;
      toggles?: { fieldId?: unknown; value?: unknown; option?: unknown; selected?: unknown }[];
      notes?: unknown;
    };
    if (!completionId) return NextResponse.json({ error: 'Missing completionId' }, { status: 400 });
    const setNotes = typeof notes === 'string';
    const toggleList = Array.isArray(toggles) ? toggles : [];
    if (!setNotes && toggleList.length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }
    for (const t of toggleList) {
      const isCheckbox = typeof t?.fieldId === 'string' && typeof t?.value === 'boolean'
        && t?.option === undefined && t?.selected === undefined;
      const isOption = typeof t?.fieldId === 'string' && typeof t?.option === 'string'
        && typeof t?.selected === 'boolean' && t?.value === undefined;
      if (!isCheckbox && !isOption) {
        return NextResponse.json({ error: 'Invalid toggle payload' }, { status: 400 });
      }
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: completion } = await admin
      .from('checklist_completions')
      .select('id, org_id, checklist_template_id, status')
      .eq('id', completionId)
      .single();
    if (!completion || completion.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Checklist not found' }, { status: 404 });
    }
    if (completion.status !== 'submitted') {
      return NextResponse.json({ error: 'Only submitted checklists can be corrected here' }, { status: 400 });
    }

    if (toggleList.length > 0) {
      // The template decides what may be ticked: plain checkboxes, and the
      // OPTIONS of multi-select lists. Nothing else.
      const { data: checklist } = await admin
        .from('client_checklists').select('sections')
        .eq('id', completion.checklist_template_id).maybeSingle();
      const sections: ChecklistSection[] =
        ((checklist?.sections as Record<string, unknown>[]) || []).map(migrateOldSection);
      const allFields = sections.flatMap(s => s.fields);
      const checkboxIds = new Set(allFields.filter(f => f.type === 'checkbox').map(f => f.id));
      const optionFields = new Map(allFields
        .filter(f => (f.type === 'multiselect' || f.type === 'multidropdown') && (f.options?.length || 0) > 0)
        .map(f => [f.id, new Set(f.options as string[])]));
      for (const t of toggleList) {
        if (typeof t.option === 'string') {
          const opts = optionFields.get(t.fieldId as string);
          if (!opts || !opts.has(t.option)) {
            return NextResponse.json(
              { error: 'That option is not part of this checklist item' }, { status: 400 });
          }
        } else if (!checkboxIds.has(t.fieldId as string)) {
          return NextResponse.json(
            { error: 'Only checkbox items can be ticked or unticked' }, { status: 400 });
        }
      }
    }

    // The RPC locks the row and merges the toggles itself, so two quick
    // corrections can never erase each other
    const { error: rpcError } = await admin.rpc('admin_edit_completion', {
      p_completion_id: completionId,
      p_editor: user.id,
      p_toggles: toggleList.length > 0
        ? toggleList.map(t => typeof t.option === 'string'
            ? { fieldId: t.fieldId as string, option: t.option, selected: t.selected as boolean }
            : { fieldId: t.fieldId as string, value: t.value as boolean })
        : null,
      p_notes: setNotes ? (notes as string) : null,
      p_set_notes: setNotes,
    });
    if (rpcError) {
      console.error('[Admin Edit] rpc error:', rpcError);
      return NextResponse.json({ error: 'Failed to save the correction' }, { status: 500 });
    }

    const { data: fresh } = await admin
      .from('checklist_completions')
      .select('id, items, notes, admin_edited_at, admin_edited_by, original_notes')
      .eq('id', completionId).single();
    return NextResponse.json({ success: true, completion: fresh });
  } catch (err) {
    console.error('[Admin Edit] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
