import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Empty, ErrorState, FilterSelect, Icon, Meter, Modal, Page, PageHead, Pagination, SearchInput, SelectField, Skeleton, TextArea, TextField,
} from '@/components/ui';
import { useApiMutation, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { fmt } from '@/lib/format';
import { FormGrid, StudentPicker, req, useForm, type StudentPick } from '../operations/shared';
import { MilestoneDrafts, STAGES, StageBadge, cleanMilestones, useMentorOptions, type ProjectRow } from './shared';

export default function ProjectsPage() {
  const list = useListParams({ sort: 'updated', dir: 'desc', pageSize: 12 }, ['stage', 'active']);
  const { campusParam } = useSchool();
  const { can } = useAuth();
  const navigate = useNavigate();
  const q = usePagedQuery<ProjectRow>('/innovation/projects', { ...list.query, ...campusParam });
  const [create, setCreate] = useState(false);
  return (
    <Page>
      <PageHead title="Projects" sub="All active and completed Innovation Lab projects."
        actions={can('innovation.manage') && <Button variant="primary" icon="plus" onClick={() => setCreate(true)}>New project</Button>} />
      <div className="filterbar">
        <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search project, code or student" />
        <FilterSelect label="Stage" value={list.filters.stage} onChange={(v) => list.setFilter('stage', v)} options={STAGES.map((s, i) => ({ value: String(i), label: s }))} />
        <FilterSelect label="Show" allLabel="All" value={list.filters.active} onChange={(v) => list.setFilter('active', v)}
          options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Completed' }]} />
        <FilterSelect label="Sort" allLabel={null} value={list.sort.key} onChange={(v) => list.setSort({ key: v, dir: v === 'title' || v === 'student' ? 'asc' : 'desc' })}
          options={[{ value: 'updated', label: 'Recently updated' }, { value: 'stage', label: 'Stage' }, { value: 'progress', label: 'Progress' }, { value: 'title', label: 'Title' }, { value: 'student', label: 'Student' }]} />
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.isLoading ? (
        <div className="grid g-3col g-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={210} style={{ borderRadius: 14 }} />)}</div>
      ) : !q.data?.rows.length ? (
        <Empty icon="rocket" title="No projects found" sub={list.hasFilters ? 'Try clearing the filters.' : 'Convert an accepted idea or start a new project.'}
          action={list.hasFilters ? <Button onClick={list.clear}>Clear filters</Button> : undefined} />
      ) : (
        <div className="grid g-3col g-4">
          {q.data.rows.map((p) => (
            <button key={p.id} type="button" className="card card--link" style={{ padding: 0, overflow: 'hidden', textAlign: 'left' }} onClick={() => navigate(`/projects/${p.id}`)}>
              <div style={{ height: 92, background: 'linear-gradient(135deg,var(--magenta),var(--magenta-light))', display: 'grid', placeItems: 'center', color: 'var(--gold)' }}>
                <Icon name={p.stage >= 6 ? 'award' : 'rocket'} size={26} />
              </div>
              <div style={{ padding: 16 }}>
                <div className="row between"><span className="t-micro t-muted">{p.code}</span><StageBadge stage={p.stage} /></div>
                <div className="t-sm t-bold mt-2">{p.title}</div>
                <div className="t-micro t-muted mt-1">{p.studentName} · {p.grade}{p.section}{p.members > 1 ? ` · +${p.members - 1} member(s)` : ''}</div>
                <div className="t-micro t-muted">Mentor {p.mentor ?? '—'} · updated {fmt.relative(p.updatedAt)}</div>
                <div className="mt-3">
                  <Meter label="Milestones" value={p.milestones ? (p.done / p.milestones) * 100 : 0} right={`${p.done}/${p.milestones}`}
                    tone={p.overdueMilestones ? 'critical' : 'amber'} hint={p.overdueMilestones ? `${p.overdueMilestones} overdue` : p.nextMilestone ? `Next: ${p.nextMilestone}${p.nextDue ? ` · ${fmt.dateShort(p.nextDue)}` : ''}` : undefined} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4"><Pagination meta={q.data?.meta} onPage={list.setPage} /></div>
      {create && <NewProjectModal onClose={() => setCreate(false)} />}
    </Page>
  );
}

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const mentors = useMentorOptions();
  const f = useForm({
    title: '', summary: '', lead: null as StudentPick | null, members: [] as StudentPick[], mentorId: '', stage: '3',
    milestones: [{ title: '', dueOn: '' }],
  });
  const v = f.values;
  const [adding, setAdding] = useState<StudentPick | null>(null);
  const save = useApiMutation<Record<string, unknown>, { id: string; code: string }>('post', '/innovation/projects', {
    invalidate: ['/innovation'], success: (r) => `Project ${r.data.code} created`,
    onSuccess: (r) => navigate(`/projects/${r.data.id}`),
  });
  const submit = async () => {
    if (!f.validate({
      lead: !v.lead ? 'Choose the lead student' : null,
      title: req(v.title, 'Title') ?? (v.title.trim().length < 4 ? 'Title is too short' : null),
      mentorId: req(v.mentorId, 'Mentor'),
    })) return;
    try {
      await save.mutateAsync({
        title: v.title.trim(), summary: v.summary || null, leadStudentId: v.lead!.id, mentorId: v.mentorId, stage: Number(v.stage),
        memberIds: v.members.map((m) => m.id), milestones: cleanMilestones(v.milestones),
      });
      onClose();
    } catch (e) { f.fromError(e); }
  };
  return (
    <Modal open onClose={onClose} title="New project" sub="Every project has a student, a mentor and evidence." size="wide" busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Create project</Button></>}>
      <FormGrid>
        <TextField label="Project title" required maxLength={160} value={v.title} onChange={(x) => f.set('title', x)} error={f.errors.title} />
        <SelectField label="Mentor" required value={v.mentorId} onChange={(x) => f.set('mentorId', x)} options={mentors} placeholder="Choose a mentor…" error={f.errors.mentorId} />
        <StudentPicker label="Lead student" required value={v.lead} onChange={(x) => f.set('lead', x)} error={f.errors.lead || f.errors.leadStudentId} />
        <SelectField label="Starting stage" value={v.stage} onChange={(x) => f.set('stage', x)} options={STAGES.slice(1, 6).map((s, i) => ({ value: String(i + 1), label: s }))} />
      </FormGrid>
      <div className="mt-3"><TextArea label="Summary" rows={2} maxLength={1000} value={v.summary} onChange={(x) => f.set('summary', x)} /></div>
      <div className="mt-3">
        <StudentPicker label="Add team members" value={adding} onChange={(s) => {
          if (s && s.id !== v.lead?.id && !v.members.some((m) => m.id === s.id)) f.set('members', [...v.members, s]);
          setAdding(null);
        }} />
        {v.members.length > 0 && (
          <div className="row g-2 wrap mt-2">
            {v.members.map((m) => (
              <span key={m.id} className="chip" aria-pressed="false">{m.fullName}
                <button type="button" aria-label={`Remove ${m.fullName}`} className="iconbtn" style={{ width: 20, height: 20 }}
                  onClick={() => f.set('members', v.members.filter((x) => x.id !== m.id))}><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4"><MilestoneDrafts items={v.milestones} onChange={(x) => f.set('milestones', x)} /></div>
    </Modal>
  );
}
