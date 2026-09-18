import { useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useApiMutation, useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useLookups } from '@/hooks/useLookups';
import {
  Badge, Button, Card, Checkbox, DataTable, ErrorState, FilterSelect, Grid, Modal, Page, PageHead, Pagination, SearchInput, SelectField,
  Status, Tabs, TextField, useConfirm,
} from '@/components/ui';
import { fmt } from '@/lib/format';

interface UserRow { id: string; email: string; phone: string | null; fullName: string; title: string | null; status: string; role: string; roleName: string; lastLoginAt: string | null; lockedUntil: string | null }
interface RoleRow { id: string; key: string; name: string; description: string; scope: string; permissions: string[]; users: number }
interface RolesData { roles: RoleRow[]; permissions: { key: string; module: string; description: string }[] }

export default function AdminUsersPage() {
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  return (
    <Page>
      <PageHead title="Users & Roles" sub="Accounts, role assignment and the permissions each role grants. Every change is audited." />
      <div className="card mb-4" style={{ padding: '0 var(--s-2)' }}>
        <Tabs items={[{ id: 'users', label: 'Users' }, { id: 'roles', label: 'Roles & permissions' }]} active={tab} onChange={setTab} />
      </div>
      {tab === 'users' ? <Users /> : <Roles />}
    </Page>
  );
}

function Users() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { lookups } = useLookups();
  const list = useListParams({ pageSize: 25 }, ['role']);
  const q = usePagedQuery<UserRow>('/users', { page: list.page, pageSize: list.pageSize, q: list.q || undefined, role: list.filters.role || undefined });
  const roles = lookups?.roles ?? [];
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', title: '', roleKey: '', campusId: '', password: '' });
  const patch = useApiMutation<{ id: string; body: Record<string, unknown> }>('patch', (v) => `/users/${v.id}`, { invalidate: ['/users'], body: (v) => v.body, success: 'User updated' });
  const create = useApiMutation<typeof form>('post', '/users', {
    invalidate: ['/users'], success: 'User created',
    body: (v) => ({ ...v, phone: v.phone || undefined, title: v.title || undefined, campusId: v.campusId || undefined }),
    onSuccess: () => { setCreating(false); setForm({ fullName: '', email: '', phone: '', title: '', roleKey: '', campusId: '', password: '' }); },
  });
  const pwOk = form.password.length >= 10 && /[a-z]/.test(form.password) && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password);
  const valid = form.fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.roleKey && pwOk;

  return (
    <>
      <div className="filterbar">
        <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search name or email" />
        <FilterSelect label="Role" value={list.filters.role} onChange={(v) => list.setFilter('role', v)} options={roles.map((r) => ({ value: r.key, label: r.name }))} />
        <div className="spacer" />
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New user</Button>
      </div>
      <Card flush>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable rows={q.data?.rows} loading={q.isLoading} rowKey={(r) => r.id}
            columns={[
              { key: 'name', label: 'User', render: (r) => <><span className="t-bold">{r.fullName}</span><div className="t-micro t-muted">{r.email}</div></> },
              { key: 'role', label: 'Role', render: (r) => (
                <select className="select" aria-label={`Role for ${r.fullName}`} value={r.role} disabled={r.id === user?.id} style={{ width: 'auto' }}
                  onChange={async (e) => {
                    const roleKey = e.target.value;
                    if (await confirm({ title: 'Change role?', body: `${r.fullName} will be signed out and receive the permissions of ${roles.find((x) => x.key === roleKey)?.name}.`, confirmLabel: 'Change role' })) {
                      patch.mutate({ id: r.id, body: { roleKey } });
                    }
                  }}>
                  {roles.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              ) },
              { key: 'status', label: 'Status', render: (r) => <>{<Status value={r.status === 'active' ? 'Active' : 'Rejected'} label={r.status} />}{r.lockedUntil && new Date(r.lockedUntil) > new Date() && <Badge tone="warning">Locked</Badge>}</> },
              { key: 'last', label: 'Last sign-in', render: (r) => (r.lastLoginAt ? fmt.dateTime(r.lastLoginAt) : 'Never') },
              { key: 'actions', label: '', className: 'num', render: (r) => r.id === user?.id ? <span className="t-micro t-muted">You</span> : (
                <div className="row g-2" style={{ justifyContent: 'flex-end' }}>
                  {r.lockedUntil && new Date(r.lockedUntil) > new Date() && <Button size="sm" onClick={() => patch.mutate({ id: r.id, body: { unlock: true } })}>Unlock</Button>}
                  <Button size="sm" variant={r.status === 'active' ? 'danger' : 'teal'} onClick={async () => {
                    const next = r.status === 'active' ? 'suspended' : 'active';
                    if (next === 'active' || await confirm({ title: 'Suspend account?', body: `${r.fullName} will be signed out immediately and cannot sign in until reactivated.`, confirmLabel: 'Suspend', danger: true })) {
                      patch.mutate({ id: r.id, body: { status: next } });
                    }
                  }}>{r.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>
                </div>
              ) },
            ]} />
        )}
        <Pagination meta={q.data?.meta} onPage={list.setPage} onPageSize={list.setPageSize} />
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="New user" busy={create.isPending}
        foot={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!valid} loading={create.isPending} onClick={() => create.mutate(form)}>Create user</Button></>}>
        <div className="form-grid">
          <TextField label="Full name" required value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} autoFocus />
          <TextField label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <TextField label="Email" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <TextField label="Mobile" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <SelectField label="Role" required value={form.roleKey} placeholder="Select…" onChange={(v) => setForm({ ...form, roleKey: v })} options={roles.map((r) => ({ value: r.key, label: r.name }))} />
          <SelectField label="Campus" value={form.campusId} placeholder="All / not set" onChange={(v) => setForm({ ...form, campusId: v })} options={(lookups?.campuses ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <TextField className="span-2" label="Temporary password" type="password" autoComplete="new-password" required value={form.password}
            onChange={(v) => setForm({ ...form, password: v })} error={form.password && !pwOk ? 'At least 10 characters with upper case, lower case and a number' : undefined}
            hint="Share it securely; the user should change it after first sign-in." />
        </div>
      </Modal>
    </>
  );
}

function Roles() {
  const q = useApiQuery<RolesData>('/roles');
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const confirm = useConfirm();
  const role = q.data?.roles.find((r) => r.id === sel) ?? q.data?.roles[0];
  const save = useApiMutation<string[]>('put', `/roles/${role?.id}/permissions`, { invalidate: ['/roles'], body: (p) => ({ permissions: p }), success: 'Role permissions updated', onSuccess: () => setDraft(null) });
  const grouped = useMemo(() => {
    const m: Record<string, RolesData['permissions']> = {};
    (q.data?.permissions ?? []).forEach((p) => (m[p.module] ??= []).push(p));
    return m;
  }, [q.data]);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const current = draft ?? new Set(role?.permissions ?? []);
  const locked = role?.key === 'super_admin';
  return (
    <Grid cols="g-side">
      <Card title="Roles" flush>
        <div>
          {(q.data?.roles ?? []).map((r) => (
            <button key={r.id} type="button" className="optioncard" aria-pressed={r.id === role?.id} style={{ borderRadius: 0, width: '100%' }} onClick={() => { setSel(r.id); setDraft(null); }}>
              <span className="col grow"><span className="t-sm t-bold">{r.name}</span><span className="t-xs t-muted">{r.users} users · {r.scope} scope</span></span>
              <Badge>{r.permissions.length}</Badge>
            </button>
          ))}
        </div>
      </Card>
      {role && (
        <Card title={role.name} sub={role.description}
          actions={!locked && draft ? <><Button onClick={() => setDraft(null)}>Discard</Button><Button variant="primary" loading={save.isPending} onClick={async () => {
            if (await confirm({ title: `Update ${role.name} permissions?`, body: `This changes what ${role.users} user(s) can see and do, immediately.`, confirmLabel: 'Save' })) save.mutate([...current]);
          }}>Save changes</Button></> : undefined}>
          {locked && <p className="t-sm t-muted mb-4">Super Admin always holds every permission.</p>}
          <div className="grid g-2col g-4">
            {Object.entries(grouped).map(([mod, perms]) => (
              <div key={mod}>
                <div className="eyebrow mb-2">{mod}</div>
                <div className="col g-1">
                  {perms.map((p) => (
                    <Checkbox key={p.key} disabled={locked} checked={current.has(p.key)} label={<span title={p.key} className="t-xs">{p.description}</span>}
                      onChange={(v) => { const n = new Set(current); if (v) n.add(p.key); else n.delete(p.key); setDraft(n); }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Grid>
  );
}
