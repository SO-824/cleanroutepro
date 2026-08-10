import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ChecklistSection, migrateOldSection, buildVisibilityMap } from '@/components/checklist/types';

/**
 * POST /api/checklist/send-report
 *
 * Owner/admin approves a submitted checklist and emails the report to the
 * client. Two modes:
 *  - { completionId, cc? }            → send via the configured email provider
 *                                       (RESEND_API_KEY); 501 when unconfigured
 *  - { completionId, markOnly: true } → record a send done through the
 *                                       owner's own mail app (mailto fallback)
 * Both record report_status='sent' + who/when/where on the completion row.
 */

interface FieldAnswer {
  fieldId: string;
  value: string | string[] | boolean | null;
  na?: boolean;
  completed_by?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Absolute http(s) only — a relative or malformed value must never become an <img src>.
 *  SVG/WebP are also dropped: Gmail and Outlook render them as broken images,
 *  so falling back to the text-only header beats broken branding. */
function absoluteHttpUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (/\.(svg|webp)$/i.test(parsed.pathname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function answerDisplay(ans: FieldAnswer | undefined): { text: string; urls: string[] } {
  if (!ans) return { text: 'No response', urls: [] };
  if (ans.na) return { text: 'N/A', urls: [] };
  const v = ans.value;
  if (v === true || v === 'yes') return { text: 'Yes', urls: [] };
  if (v === false || v === 'no') return { text: 'No', urls: [] };
  if (Array.isArray(v)) {
    const urls = v.filter(x => typeof x === 'string' && x.startsWith('http'));
    if (urls.length === v.length && urls.length > 0) return { text: `${urls.length} attachment${urls.length !== 1 ? 's' : ''}`, urls };
    return { text: v.join(', ') || 'None selected', urls: [] };
  }
  if (v) return { text: String(v), urls: [] };
  return { text: 'No response', urls: [] };
}

export async function POST(request: NextRequest) {
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serverSupabase
      .from('profiles').select('org_id, role, full_name').eq('id', user.id).single();
    if (!profile?.org_id || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Only owners and admins can send reports' }, { status: 403 });
    }

    const body = await request.json();
    const { completionId, cc, markOnly, preview } = body as { completionId?: string; cc?: string; markOnly?: boolean; preview?: boolean };
    if (!completionId) return NextResponse.json({ error: 'Missing completionId' }, { status: 400 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Load the completion — must belong to this org and be submitted
    const { data: completion } = await admin
      .from('checklist_completions')
      .select('id, org_id, client_id, checklist_template_id, items, notes, status, submitted_at, completed_at, report_status')
      .eq('id', completionId)
      .single();
    if (!completion || completion.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Checklist not found' }, { status: 404 });
    }
    if (completion.status !== 'submitted') {
      return NextResponse.json({ error: 'Only submitted checklists can be sent' }, { status: 400 });
    }

    // Load client (recipient), checklist (labels) and org (sender name)
    const { data: client } = await admin
      .from('clients')
      .select('name, email, address, report_use_override, report_override_email')
      .eq('id', completion.client_id).maybeSingle();
    // Effective recipient: the per-client override (testing / alternate inbox)
    // wins when enabled — resolved HERE so the client UI can't be spoofed
    const recipient = (client?.report_use_override && client?.report_override_email)
      ? client.report_override_email
      : (client?.email || null);
    if (!recipient && !preview) {
      return NextResponse.json(
        { error: 'This client has no email address. Add one on the Clients page (or set an override) first.' },
        { status: 422 });
    }

    const markSent = async (via: 'email' | 'mail_app') => {
      const { error } = await admin.from('checklist_completions').update({
        report_status: 'sent',
        report_sent_at: new Date().toISOString(),
        report_sent_to: recipient,
        report_sent_by: user.id,
        report_sent_via: via,
      }).eq('id', completionId);
      if (error) throw new Error(`Failed to record the send: ${error.message}`);
    };

    // ── Mailto fallback: the owner sent it from their own mail app ──────────
    if (markOnly) {
      await markSent('mail_app');
      return NextResponse.json({ success: true, via: 'mail_app', sentTo: recipient });
    }

    // (provider check happens AFTER rendering so preview works unconfigured)
    const { data: checklist } = await admin
      .from('client_checklists').select('name, sections').eq('id', completion.checklist_template_id).maybeSingle();
    const { data: org } = await admin
      .from('organizations').select('name, logo_url').eq('id', profile.org_id).single();

    const sections: ChecklistSection[] = ((checklist?.sections as Record<string, unknown>[]) || []).map(migrateOldSection);
    // The report renders from the live template — if it was deleted the email
    // would be an empty shell, so refuse rather than send a blank report.
    if (sections.length === 0) {
      return NextResponse.json(
        { error: 'The checklist template behind this completion no longer exists, so the report cannot be rendered.' },
        { status: 409 });
    }
    const items: FieldAnswer[] = typeof completion.items === 'string'
      ? JSON.parse(completion.items) : (completion.items as FieldAnswer[] || []);
    const answers = new Map(items.map(a => [a.fieldId, a]));

    // Same visibility rules as the staff form — hidden fields stay out
    const visibilityMap = buildVisibilityMap(
      sections.flatMap(s => s.fields),
      items.map(a => ({ field_id: a.fieldId, value: a.value, na: !!a.na })),
    );

    const orgName = org?.name || 'CleanRoute Pro';
    const checklistName = checklist?.name || 'Checklist';
    const when = completion.submitted_at || completion.completed_at;
    const dateStr = when ? new Date(when).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

    let rows = '';
    for (const sec of sections) {
      const visible = sec.fields.filter(f =>
        f.type !== 'heading' && f.type !== 'paragraph' && f.type !== 'logic' && visibilityMap[f.id] !== false);
      if (visible.length === 0) continue;
      if (sec.title) {
        rows += `<tr><td colspan="2" style="padding:16px 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">${esc(sec.title)}</td></tr>`;
      }
      for (const f of visible) {
        const { text, urls } = answerDisplay(answers.get(f.id));
        const links = urls.map((u, i) => `<a href="${esc(u)}" style="color:#4F46E5;">Attachment ${i + 1}</a>`).join(' &middot; ');
        rows += `<tr>
          <td style="padding:7px 12px 7px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;vertical-align:top;width:55%;">${esc(f.label)}</td>
          <td style="padding:7px 0;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;vertical-align:top;">${esc(text)}${links ? `<br/>${links}` : ''}</td>
        </tr>`;
      }
    }

    const notesHtml = completion.notes
      ? `<div style="margin-top:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
           <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#92400e;">Notes</p>
           <p style="margin:0;font-size:13px;color:#1f2937;white-space:pre-wrap;">${esc(completion.notes)}</p>
         </div>` : '';

    // Outlook's Word engine ignores CSS max-width on images, so the display size
    // has to be a real width attribute. The org name stays as text below the
    // logo because most clients block images by default.
    const logoUrl = absoluteHttpUrl(org?.logo_url);
    const logoHtml = logoUrl
      ? `<div style="margin:0 0 14px;"><img src="${esc(logoUrl)}" width="160" alt="${esc(orgName)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" /></div>`
      : '';

    // Nested tables, not a max-width div: Outlook's Word engine ignores
    // max-width and margin:auto, so a div-only layout stretches full-screen
    // there. width="640" is for Outlook; the inline style handles everyone else.
    const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;"><tr>
<td style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;text-align:left;">
  ${logoHtml}<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#4F46E5;">${esc(orgName)}</p>
  <h1 style="margin:6px 0 2px;font-size:20px;color:#111827;">${esc(checklistName)}</h1>
  <p style="margin:0;font-size:13px;color:#6b7280;">${esc(client?.name || '')}${client?.address ? ` &middot; ${esc(client.address)}` : ''}</p>
  ${dateStr ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">Completed ${esc(dateStr)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;margin-top:18px;">${rows}</table>
  ${notesHtml}
  <p style="margin-top:28px;font-size:11px;color:#9ca3af;">Sent by ${esc(orgName)} via CleanRoute Pro</p>
</td></tr></table>
</td></tr></table>`;

    const ccList = (cc || '').split(',').map(s => s.trim()).filter(Boolean);
    // Client-facing subject: no internal checklist names, no restating the
    // client's own name — the sender line already says who it's from.
    const subjectDate = when
      ? new Date(when).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const subject = subjectDate ? `Cleaning report — ${subjectDate}` : 'Cleaning report';

    // ── Preview: return the rendered email exactly as the client will see it ──
    if (preview) {
      return NextResponse.json({
        preview: true, subject, to: recipient, cc: ccList, html,
        overridden: !!(client?.report_use_override && client?.report_override_email),
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'not_configured', message: 'No email service is configured (RESEND_API_KEY missing).' },
        { status: 501 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.REPORT_FROM_EMAIL || `${orgName} <onboarding@resend.dev>`,
        to: [recipient!],
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      console.error('[Send Report] provider error:', res.status, detail);
      return NextResponse.json(
        { error: `Email provider rejected the send: ${detail?.message || res.status}` },
        { status: 502 });
    }

    try {
      await markSent('email');
    } catch (recordErr) {
      // The email is already on its way — surfacing a failure here would tell
      // the operator it didn't send and invite a duplicate to the client.
      console.error('[Send Report] email sent but recording failed:', recordErr);
      return NextResponse.json({ success: true, via: 'email', sentTo: recipient, cc: ccList, recorded: false });
    }
    return NextResponse.json({ success: true, via: 'email', sentTo: recipient, cc: ccList });
  } catch (err) {
    console.error('[Send Report] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
