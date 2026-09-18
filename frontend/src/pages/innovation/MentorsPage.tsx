import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, DataTable, ErrorState, Grid, Kpi, Modal, Page, PageHead, Person, SearchInput, SelectField, useConfirm } from '@/components/ui';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { fmt } from '@/lib/format';
import { StageBadge, type Mentor } from './shared';

const LOAD_LIMIT = 4;

export default function MentorsPage() {
  const { campusParam } = useSchool();
  const { can } = useAuth();
  const manage = can('innovation.manage');
  const [q, setQ] = useState('');
  const list = useApiQuery<Mentor[]>('/innovation/mentors', { ...campusParam, q: q || undefined });
  const [invite, setInvite] = useState(false);
  const [view, setView] = useState<Mentor | null>(null);
  const confirm = useConfirm();
  const toggle = useApiMutation<{ id: string; isMentor: boolean }>('patch', (v) => `/innovation/mentors/${v.id}`, { invalidate: ['/innovation/mentors'], body: (v) => ({ isMentor: v.isMentor }) });
  const rows = list.data ?? [];
  const panel = rows.filter((m) => m.isMentor);
  const overloaded = rows.filter((m) => m.activeProjects >= LOAD_LIMIT).length;
  return (
    <Page>
      <PageHead title="Mentors" sub="Staff supporting student projects, with their current load."
        actions={manage && <Button variant="primary" icon="plus" onClick={() => setInvite(true)}>Add a mentor</Button>} />
      <Grid cols="g-4col">
        <Kpi label="On the mentor panel" value={fmt.n(panel.length)} loading={list.isLoading} />
        <Kpi label="Mentoring now" value={fmt.n(rows.filter((m) => m.activeProjects > 0).length)} tone="teal" loading={list.isLoading} />
        <Kpi label="Students supported" value={fmt.n(rows.reduce((a, m) => a + m.students, 0))} tone="info" loading={list.isLoading} foot="Across active projects" />
        <Kpi label={`At ${LOAD_LIMIT}+ active projects`} value={fmt.n(overloaded)} tone={overloaded ? 'critical' : 'teal'} loading={list.isLoading} />
      </Grid>
      <div className="filterbar mt-4"><SearchInput value={q} onSearch={setQ} placeholder="Search mentors" /></div>
      <Card flush>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} /> : (
          <DataTable<Mentor>
            rows={list.data} loading={list.isLoading} rowKey={(r) => r.id} onRowClick={setView} emptyText="No mentors yet."
            columns={[
              { key: 'name', label: 'Mentor', render: (r) => <Person name={r.name} meta={`${r.designation} · ${r.campusName}`} /> },
              { key: 'type', label: 'Type', render: (r) => r.isMentor ? <Badge tone="neutral">Staff</Badge> : <Badge tone="warning">Not on panel</Badge> },
              { key: 'projects', label: 'Projects', className: 'num', render: (r) => <><span className={`t-num t-bold ${r.activeProjects >= LOAD_LIMIT ? 't-critical' : ''}`}>{r.activeProjects}</span>
                <div className="t-micro t-muted">{r.completedProjects} completed</div></> },
              { key: 'students', label: 'Students', className: 'num', render: (r) => <span className="t-num">{r.students}</span> },
              { key: 'feedback', label: 'Feedback (30 days)', className: 'num', render: (r) => <span className="t-num">{r.feedback30d}</span> },
              { key: 'a', label: '', className: 'num', render: (r) => (
                <div className="row g-2" style={{ justifyContent: 'flex-end' }}>
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); setView(r); }}>View</Button>
                  {manage && r.isMentor && <Button size="sm" variant="quiet" onClick={async (e) => {
                    e.stopPropagation();
                    if (await confirm({ title: `Remove ${r.name} from the mentor panel?`, body: r.activeProjects ? `They still mentor ${r.activeProjects} active project(s); those keep their mentor until reassigned.` : undefined, confirmLabel: 'Remove', danger: true })) {
                      toggle.mutate({ id: r.id, isMentor: false });
                    }
                  }}>Remove</Button>}
                </div>
              ) },
            ]}
          />
        )}
      </Card>
      <p className="t-xs t-muted mt-3">Alumni and partner-institution mentors are managed in CRM and are not yet linked to projects.</p>
      {invite && <InviteModal onClose={() => setInvite(false)} />}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''} sub={view ? `${view.designation} · ${view.department} · ${view.campusName}` : ''}
        foot={<Button onClick={() => setView(null)}>Close</Button>}>
        {view && (!view.projects.length ? <p className="t-sm t-muted">No active projects.</p> : (
          <div className="col g-2">
            {view.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="row between card card--link" style={{ padding: '8px 12px' }}>
                <span><span className="t-micro t-muted">{p.code}</span> <span className="t-sm t-bold">{p.title}</span></span>
                <StageBadge stage={p.stage} />
              </Link>
            ))}
          </div>
        ))}
      </Modal>
    </Page>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const all = useApiQuery<Mentor[]>('/innovation/mentors', { all: true });
  const [id, setId] = useState('');
  const [err, setErr] = useState('');
  const save = useApiMutation<{ isMentor: boolean }>('patch', `/innovation/mentors/${id}`, { invalidate: ['/innovation/mentors'] });
  const options = (all.data ?? []).filter((m) => !m.isMentor).map((m) => ({ value: m.id, label: `${m.name} — ${m.designation}` }));
  return (
    <Modal open onClose={onClose} title="Add a mentor" sub="Teaching staff on the panel can be assigned to projects." busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={async () => {
        if (!id) { setErr('Choose a teacher'); return; }
        try { await save.mutateAsync({ isMentor: true }); onClose(); } catch { /* toast */ }
      }}>Add to panel</Button></>}>
      <SelectField label="Teacher" required value={id} onChange={(x) => { setId(x); setErr(''); }} options={options}
        placeholder={all.isLoading ? 'Loading…' : options.length ? 'Choose…' : 'Every teacher is already on the panel'} error={err} />
    </Modal>
  );
}
