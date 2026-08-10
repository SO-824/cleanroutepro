'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/hooks/useAuth';
import HelpTip from '@/components/HelpTip';
import { RouteGlyph } from '@/components/BrandMark';
import { createClient } from '@/lib/supabase/client';
import { getAppTimezone, setAppTimezone, TIMEZONE_OPTIONS } from '@/lib/timezone';

// Mirrors the "org-assets" bucket limits — the bucket rejects anything else server-side.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
// PNG/JPG only: SVG and WebP upload fine but render as broken images in
// Gmail and Outlook, where the report emails actually land.
const LOGO_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export default function SettingsPage({ overrideRole }: { overrideRole?: 'owner' | 'admin' | 'supervisor' | 'staff' }) {
  const { profile, refreshProfile } = useAuth();
  // Staff View preview passes the previewed member's role so owner-only
  // sections show/hide as they would for that person
  const effectiveRole = overrideRole ?? profile?.role;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Admin-only page
  useEffect(() => {
    if (profile && profile.role !== 'owner' && profile.role !== 'admin') {
      router.replace('/dashboard/schedule');
    }
  }, [profile?.role, router]);
  const [orgName, setOrgName] = useState(profile?.org_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Timezone state — initialized from the global module (which was set by auth hook)
  const [timezone, setTimezone] = useState(getAppTimezone());
  const [tzSaving, setTzSaving] = useState(false);
  const [tzSaved, setTzSaved] = useState(false);

  // Org-level defaults for new teams
  const [defaults, setDefaults] = useState({
    default_fuel_efficiency: 10,
    default_fuel_price: 1.85,
    default_per_km_rate: 0,
  });
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Payroll cycle start day
  const [payrollStartDay, setPayrollStartDay] = useState(1);
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [payrollSaved, setPayrollSaved] = useState(false);

  // Company logo — logo_path is the storage key, kept so the old file can be
  // deleted when the logo is replaced or removed.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Sync timezone state when profile loads
  useEffect(() => {
    setTimezone(getAppTimezone());
  }, [profile]);

  // Load org defaults
  useEffect(() => {
    if (!profile?.org_id) return;
    supabase
      .from('organizations')
      .select('default_fuel_efficiency, default_fuel_price, default_per_km_rate, payroll_cycle_start_day, logo_url, logo_path')
      .eq('id', profile.org_id)
      .single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setDefaults({
            default_fuel_efficiency: Number(data.default_fuel_efficiency) || 10,
            default_fuel_price: Number(data.default_fuel_price) || 1.85,
            default_per_km_rate: Number(data.default_per_km_rate) || 0,
          });
          setPayrollStartDay(data.payroll_cycle_start_day ?? 1);
          setLogoUrl(data.logo_url ?? null);
          setLogoPath(data.logo_path ?? null);
        }
      });
  }, [supabase, profile?.org_id]);

  const handleSaveOrg = async () => {
    if (!profile?.org_id) return;
    setSaving(true);
    await supabase.from('organizations').update({ name: orgName }).eq('id', profile.org_id);
    await refreshProfile();
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveTimezone = async () => {
    if (!profile?.org_id) return;
    setTzSaving(true);
    await supabase.from('organizations').update({ timezone }).eq('id', profile.org_id);
    setAppTimezone(timezone);
    await refreshProfile();
    setTzSaving(false); setTzSaved(true);
    setTimeout(() => setTzSaved(false), 2000);
  };

  const handleSaveDefaults = async () => {
    if (!profile?.org_id) return;
    setDefaultsSaving(true);
    // Save org defaults
    await supabase.from('organizations').update(defaults).eq('id', profile.org_id);
    // Propagate fuel/km settings to all existing teams in this org
    await supabase.from('teams').update({
      fuel_efficiency: defaults.default_fuel_efficiency,
      fuel_price: defaults.default_fuel_price,
      per_km_rate: defaults.default_per_km_rate,
    }).eq('org_id', profile.org_id);
    setDefaultsSaving(false); setDefaultsSaved(true);
    setTimeout(() => setDefaultsSaved(false), 2000);
  };

  const handleLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.org_id) return;
    setLogoError(null);

    const resetInput = () => { if (logoInputRef.current) logoInputRef.current.value = ''; };

    if (!LOGO_MIME_EXT[file.type]) {
      setLogoError('That file is not a supported image. Use a PNG or JPG — other formats do not display in email apps like Gmail and Outlook.');
      resetInput();
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB. Please use a smaller image.`);
      resetInput();
      return;
    }

    setLogoBusy(true);
    const previousPath = logoPath;
    try {
      const dot = file.name.lastIndexOf('.');
      const rawExt = dot >= 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      const ext = rawExt || LOGO_MIME_EXT[file.type];
      const path = `${profile.org_id}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('org-assets').upload(path, file);
      if (uploadError) {
        setLogoError(`Upload failed: ${uploadError.message}`);
        return;
      }

      const publicUrl = supabase.storage.from('org-assets').getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl, logo_path: path })
        .eq('id', profile.org_id);

      if (updateError) {
        // The row never saved, so bin the upload instead of orphaning it.
        await supabase.storage.from('org-assets').remove([path]);
        setLogoError(`Could not save the logo: ${updateError.message}`);
        return;
      }

      setLogoUrl(publicUrl);
      setLogoPath(path);
      // Only safe once the new row is committed — never before.
      if (previousPath && previousPath !== path) {
        await supabase.storage.from('org-assets').remove([previousPath]);
      }
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 2000);
    } finally {
      setLogoBusy(false);
      resetInput();
    }
  };

  const handleRemoveLogo = async () => {
    if (!profile?.org_id || !logoPath) return;
    if (!confirm('Remove your logo? Checklist reports emailed to clients will no longer show it.')) return;
    setLogoBusy(true);
    setLogoError(null);
    const previousPath = logoPath;
    const { error } = await supabase
      .from('organizations')
      .update({ logo_url: null, logo_path: null })
      .eq('id', profile.org_id);

    if (error) {
      setLogoError(`Could not remove the logo: ${error.message}`);
      setLogoBusy(false);
      return;
    }
    await supabase.storage.from('org-assets').remove([previousPath]);
    setLogoUrl(null);
    setLogoPath(null);
    setLogoBusy(false);
    setLogoSaved(true);
    setTimeout(() => setLogoSaved(false), 2000);
  };

  const handleSavePayrollCycle = async () => {
    if (!profile?.org_id) return;
    setPayrollSaving(true);
    await supabase.from('organizations').update({ payroll_cycle_start_day: payrollStartDay }).eq('id', profile.org_id);
    setPayrollSaving(false); setPayrollSaved(true);
    setTimeout(() => setPayrollSaved(false), 2000);
  };

  // Detect browser timezone for the label
  const browserTz = useMemo(() => {
    if (typeof Intl !== 'undefined') {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return 'Unknown';
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 custom-scrollbar pb-20 lg:pb-6">
      <div className="max-w-[600px] mx-auto space-y-6">
        <div><div className="flex items-center gap-1.5"><h2 className="text-lg font-bold text-text-primary">Organisation Settings</h2><HelpTip tip="Organisation-wide defaults: name, timezone, rates, fuel settings and the payroll cycle start day." article="org-setup" /></div><p className="text-sm text-text-secondary">Manage your organisation's settings</p></div>

        {/* Business Profile */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Business Profile</h3>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Business Name</label>
            <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="input-field text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSaveOrg} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save Changes'}</button>
            {saved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-success font-medium">✓ Saved</motion.span>}
          </div>
        </div>

        {/* ── Company Logo ────────────────────────────────────────────────── */}
        {effectiveRole === 'owner' && (
        <div className="card-elevated p-5 space-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-text-primary">Company Logo</h3>
              <HelpTip tip="Your logo appears at the top of the checklist report emails sent to clients." article="checklist-workflow" />
            </div>
            <p className="text-xs text-text-tertiary mt-0.5">
              This logo is shown at the top of every checklist report email your clients receive.
              A wide (landscape) PNG with a transparent or white background looks best — it appears about 160px wide in the email.
            </p>
          </div>

          {/* White preview background: the email shows the logo on white, so dark
              logos and transparent PNGs must be judged against white here too. */}
          {logoUrl ? (
            <div className="rounded-xl border border-border-light bg-white p-4 flex items-center justify-center">
              <img src={logoUrl} alt="Company logo" className="max-h-14 w-auto object-contain" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border-light bg-white p-6 text-center">
              <p className="text-xs text-text-tertiary">
                No logo yet. Upload one to brand the checklist reports emailed to your clients.
              </p>
            </div>
          )}

          {logoError && (
            <p className="text-xs text-danger">{logoError}</p>
          )}

          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleLogoPick}
            className="hidden"
          />

          <div className="flex items-center gap-2">
            <button onClick={() => logoInputRef.current?.click()} disabled={logoBusy} className="btn-primary text-sm">
              {logoBusy ? 'Working...' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
            </button>
            {logoUrl && (
              <button onClick={handleRemoveLogo} disabled={logoBusy} className="btn-secondary text-sm">Remove</button>
            )}
            {logoSaved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-success font-medium">✓ Saved</motion.span>}
          </div>
          <p className="text-[11px] text-text-tertiary">PNG or JPG — up to 2 MB.</p>
        </div>
        )}

        {/* Timezone Setting */}
        <div className="card-elevated p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Timezone</h3>
            <p className="text-xs text-text-tertiary mt-0.5">All dates and times across the app will display in this timezone.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Business Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="input-field text-sm w-full"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-text-tertiary mt-1.5">
              Your browser timezone: <span className="font-medium text-text-secondary">{browserTz}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSaveTimezone} disabled={tzSaving} className="btn-primary text-sm">
              {tzSaving ? 'Saving...' : 'Save Timezone'}
            </button>
            {tzSaved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-success font-medium">✓ Saved</motion.span>}
          </div>
        </div>

        {/* ── Scheduling Defaults ─────────────────────────────────────────── */}
        {effectiveRole === 'owner' && (
        <div className="card-elevated p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Scheduling Defaults</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              Fuel and mileage settings. Saving will update all existing teams.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fuel Efficiency */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Fuel Efficiency</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0} step={0.5}
                  value={defaults.default_fuel_efficiency}
                  onChange={e => setDefaults(d => ({ ...d, default_fuel_efficiency: parseFloat(e.target.value) || 0 }))}
                  className="input-field text-sm"
                />
                <span className="text-xs text-text-tertiary whitespace-nowrap">L/100km</span>
              </div>
            </div>

            {/* Fuel Price */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Fuel Price</label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-text-tertiary">$</span>
                <input
                  type="number" min={0} step={0.01}
                  value={defaults.default_fuel_price}
                  onChange={e => setDefaults(d => ({ ...d, default_fuel_price: parseFloat(e.target.value) || 0 }))}
                  className="input-field text-sm"
                />
                <span className="text-xs text-text-tertiary whitespace-nowrap">/litre</span>
              </div>
            </div>

            {/* Per-km Allowance */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Per-km Allowance</label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-text-tertiary">$</span>
                <input
                  type="number" min={0} step={0.01}
                  value={defaults.default_per_km_rate}
                  onChange={e => setDefaults(d => ({ ...d, default_per_km_rate: parseFloat(e.target.value) || 0 }))}
                  className="input-field text-sm"
                />
                <span className="text-xs text-text-tertiary whitespace-nowrap">/km</span>
              </div>
              <p className="text-[11px] text-text-tertiary mt-1">Set to 0 to use fuel cost calculation instead</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleSaveDefaults} disabled={defaultsSaving} className="btn-primary text-sm">
              {defaultsSaving ? 'Saving...' : 'Save Defaults'}
            </button>
            {defaultsSaved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-success font-medium">✓ Saved</motion.span>}
          </div>
        </div>
        )}

        {/* ── Payroll Settings ────────────────────────────────────────────── */}
        {effectiveRole === 'owner' && (
        <div className="card-elevated p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Payroll Settings</h3>
            <p className="text-xs text-text-tertiary mt-0.5">Configure your organization's payroll cycle.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Payroll Cycle Start Day</label>
            <select
              value={payrollStartDay}
              onChange={(e) => setPayrollStartDay(Number(e.target.value))}
              className="input-field text-sm w-full"
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={2}>Tuesday</option>
              <option value={3}>Wednesday</option>
              <option value={4}>Thursday</option>
              <option value={5}>Friday</option>
              <option value={6}>Saturday</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSavePayrollCycle} disabled={payrollSaving} className="btn-primary text-sm">
              {payrollSaving ? 'Saving...' : 'Save Payroll Cycle'}
            </button>
            {payrollSaved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-success font-medium">✓ Saved</motion.span>}
          </div>
        </div>
        )}

        {/* Subscription */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Subscription</h3>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${profile?.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {profile?.subscription_status || 'trialing'}
            </span>
            <span className="text-sm text-text-secondary capitalize">{profile?.subscription_tier || 'Pro'} Plan</span>
          </div>
          <p className="text-xs text-text-tertiary">Manage your subscription and billing through the Stripe Customer Portal.</p>
          <button className="btn-secondary text-sm" onClick={async () => {
            // The portal route is POST and returns { url } — a plain
            // window.open GET hits a 405 and shows an error page.
            try {
              const res = await fetch('/api/stripe/portal', { method: 'POST' });
              const data = await res.json();
              if (res.ok && data.url) window.open(data.url, '_blank');
              else alert(data.error || 'Could not open the billing portal.');
            } catch {
              alert('Could not open the billing portal — please try again.');
            }
          }}>Manage Subscription</button>
        </div>

        {/* Account Info */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Account</h3>
          <div className="text-sm text-text-secondary space-y-1">
            <p><span className="text-text-tertiary">Email:</span> {profile?.email}</p>
            <p><span className="text-text-tertiary">Role:</span> <span className="capitalize">{profile?.role}</span></p>
          </div>
        </div>

        {profile?.is_platform_admin && (
          <a href="/admin" className="block card-elevated p-5 hover:border-primary transition-colors group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <RouteGlyph size={18} />
              </div>
              <div><h4 className="text-sm font-bold text-text-primary">Platform Admin</h4><p className="text-xs text-text-tertiary">View all tenants and manage the platform</p></div>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
