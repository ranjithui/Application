import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { Avatar, Badge, Button, Card, DataTable, Dl, ErrorState, Grid, InlineError, Page, PageHead, Tabs, TextField, useConfirm } from '@/components/ui';
import { fmt } from '@/lib/format';

type Tab = 'profile' | 'security' | 'notifications' | 'sessions';
interface Pref { topic: string; inApp: boolean; whatsapp: boolean; sms: boolean; email: boolean; push: boolean }
const TOPICS = ['attendance', 'tracking', 'fees', 'transport', 'homework', 'events', 'circulars', 'safety', 'system'];

export default function AccountPage() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'profile';
  if (!user) return null;
  return (
    <Page>
      <PageHead title="My account" sub="Your profile, password, notification preferences and signed-in devices." />
      <div className="card mb-4" style={{ padding: '0 var(--s-2)' }}>
        <Tabs<Tab>
          items={[{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Password' }, { id: 'notifications', label: 'Notification preferences' }, { id: 'sessions', label: 'Privacy & sessions' }]}
          active={tab}
          onChange={(t) => setSp(t === 'profile' ? {} : { tab: t }, { replace: true })}
        />
      </div>
      {tab === 'profile' && (
        <Card>
          <div className="row-top g-5 wrap">
            <Avatar name={user.fullName} size="xl" tone="avatar--amber" />
            <div className="grow">
              <Dl items={[
                ['Name', user.fullName], ['Title', user.title], ['Email', user.email], ['Role', <Badge key="r" tone="info">{user.role.name}</Badge>],
                ['Campus', user.campus_name], ['Academic year', user.academic_year], ['Permissions', `${user.permissions.length} granted by your role`],
              ]} />
              <p className="t-xs t-muted mt-4">To correct your name or contact details, contact the school office — changes to identity records are verified.</p>
            </div>
          </div>
        </Card>
      )}
      {tab === 'security' && <PasswordForm />}
      {tab === 'notifications' && <Preferences />}
      {tab === 'sessions' && <Sessions />}
    </Page>
  );
}

function PasswordForm() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const save = useApiMutation<{ currentPassword: string; newPassword: string }>('post', '/auth/change-password', {
    error: false,
    onSuccess: async () => { await logout(); navigate('/login', { replace: true }); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (!v.current) x.current = 'Enter your current password';
    if (v.next.length < 10 || !/[a-z]/.test(v.next) || !/[A-Z]/.test(v.next) || !/[0-9]/.test(v.next)) x.next = 'At least 10 characters with upper case, lower case and a number';
    if (v.next !== v.confirm) x.confirm = 'Passwords do not match';
    setErr(x);
    if (!Object.keys(x).length) save.mutate({ currentPassword: v.current, newPassword: v.next });
  };
  return (
    <Card title="Change password" sub="You will be signed out of every device after the change.">
      <form className="col g-4" style={{ maxWidth: 420 }} onSubmit={submit} noValidate>
        {save.error && <InlineError error={save.error} />}
        <TextField label="Current password" type="password" autoComplete="current-password" required value={v.current} onChange={(x) => setV({ ...v, current: x })} error={err.current} />
        <TextField label="New password" type="password" autoComplete="new-password" required value={v.next} onChange={(x) => setV({ ...v, next: x })} error={err.next ?? (save.error instanceof ApiError ? save.error.fieldErrors.newPassword : undefined)} hint="At least 10 characters, with upper case, lower case and a number." />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" required value={v.confirm} onChange={(x) => setV({ ...v, confirm: x })} error={err.confirm} />
        <div><Button variant="primary" type="submit" loading={save.isPending}>Change password</Button></div>
      </form>
    </Card>
  );
}

function Preferences() {
  const q = useApiQuery<Pref[]>('/notification-preferences');
  const [rows, setRows] = useState<Pref[]>([]);
  useEffect(() => {
    if (!q.data) return;
    setRows(TOPICS.map((t) => q.data!.find((p) => p.topic === t) ?? { topic: t, inApp: true, whatsapp: true, sms: false, email: true, push: true }));
  }, [q.data]);
  const save = useApiMutation<Pref[]>('put', '/notification-preferences', { invalidate: ['/notification-preferences'], success: 'Preferences saved' });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const toggle = (i: number, k: keyof Omit<Pref, 'topic'>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: !x[k] } : x)));
  const ch = (k: keyof Omit<Pref, 'topic'>, label: string) => ({
    key: k, label, render: (r: Pref) => <input type="checkbox" aria-label={`${label} for ${r.topic}`} checked={r[k]} onChange={() => toggle(rows.indexOf(r), k)} />,
  });
  return (
    <Card title="Notification preferences" sub="Critical safety alerts are always shown in the app." flush
      foot={<Button variant="primary" loading={save.isPending} onClick={() => save.mutate(rows)}>Save preferences</Button>}>
      <DataTable rows={rows} loading={q.isLoading} rowKey={(r) => r.topic} stack={false}
        columns={[{ key: 'topic', label: 'Topic', render: (r) => <span className="t-bold" style={{ textTransform: 'capitalize' }}>{r.topic}</span> },
          ch('inApp', 'In-app'), ch('push', 'Push'), ch('whatsapp', 'WhatsApp'), ch('sms', 'SMS'), ch('email', 'Email')]} />
    </Card>
  );
}

interface Session { family_id: string; client_type: string; user_agent: string | null; ip: string | null; started_at: string; last_active_at: string }

function Sessions() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const q = useApiQuery<Session[]>('/auth/sessions');
  const revoke = useApiMutation('post', '/auth/sessions/revoke-all', { onSuccess: async () => { await logout(); navigate('/login', { replace: true }); } });
  return (
    <Grid cols="g-main">
      <Card title="Signed-in devices" flush>
        {q.error ? <ErrorState error={q.error} /> : (
          <DataTable rows={q.data} loading={q.isLoading} rowKey={(r) => r.family_id} emptyText="No active sessions."
            columns={[
              { key: 'client', label: 'Client', render: (r) => <Badge tone="info">{r.client_type}</Badge> },
              { key: 'agent', label: 'Device', render: (r) => <span className="t-xs t-clip" style={{ maxWidth: 320, display: 'inline-block' }}>{r.user_agent ?? '—'}</span> },
              { key: 'ip', label: 'IP', render: (r) => r.ip ?? '—' },
              { key: 'last', label: 'Last active', render: (r) => fmt.dateTime(r.last_active_at) },
            ]} />
        )}
      </Card>
      <Card title="Privacy and access">
        <p className="t-sm">Your data is visible only to people whose role requires it. Views of sensitive records — including student locations — are recorded in the audit trail.</p>
        <div className="mt-4">
          <Button variant="danger" icon="logout" loading={revoke.isPending} onClick={async () => {
            if (await confirm({ title: 'Sign out everywhere?', body: 'Every device, including this one, will need to sign in again.', confirmLabel: 'Sign out everywhere', danger: true })) revoke.mutate({});
          }}>Sign out of all devices</Button>
        </div>
      </Card>
    </Grid>
  );
}
