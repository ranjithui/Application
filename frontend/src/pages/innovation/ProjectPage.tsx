import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Avatar, Badge, Banner, Button, Card, Checkbox, DataTable, Empty, ErrorState, Icon, Modal, Page, PageHead, PageSkeleton,
  SelectField, Status, Stepper, StudentLink, TextArea, TextField, useConfirm,
} from '@/components/ui';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/auth/AuthContext';
import { fmt } from '@/lib/format';
import { FormGrid, StudentPicker, req, todayIso, useForm, type StudentPick } from '../operations/shared';
import { STAGES, useMentorOptions } from './shared';

interface Milestone { id: string; sequence: number; title: string; dueOn: string | null; completedOn: string | null; evidence: string | null; feedback: string | null; status: string }
interface Project {
  id: string; code: string; title: string; summary: string | null; stage: number; status: string; startedOn: string | null; updatedAt: string;
  mentorId: string | null; mentor: string | null; mentorRole: string | null; ideaTitle: string | null; ideaSubmittedOn: string | null;
  studentId: string; studentName: string; admissionNo: string; grade: string | null; section: string | null; campusName: string;
  members: { role: string; studentId: string; studentName: string; admissionNo: string; grade: string | null; section: string | null }[];
  milestones: Milestone[];
  evidence: { id: string; title: string; kind: string; link: string | null; note: string | null; createdAt: string; addedBy: string | null; milestone: string | null }[];
  feedback: { id: string; author: string; authorRole: string | null; body: string; createdAt: string }[];
  competitions: { id: string; name: string; level: string; heldOn: string; result: string | null }[];
  achievements: { id: string; title: string; type: string; level: string | null; achievedOn: string; verified: boolean }[];
}

const KIND_ICON: Record<string, string> = { Photo: 'camera', Video: 'play', Link: 'link', 'Test log': 'activity', 'Judging sheet': 'award', Document: 'fileText' };
const msTone = (s: string) => (s === 'Completed' ? 'teal' : s === 'Overdue' ? 'critical' : s === 'In Progress' ? 'amber' : 'muted');

export default function ProjectPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const manage = can('innovation.manage');
  const q = useApiQuery<Project>(id ? `/innovation/projects/${id}` : null);
  const [modal, setModal] = useState<null | 'advance' | 'milestone' | 'evidence' | 'feedback' | 'member' | 'edit'>(null);
  const [editMs, setEditMs] = useState<Milestone | null>(null);
  const confirm = useConfirm();
  const inv = [`/innovation`];
  const removeMember = useApiMutation<string>('delete', (sid) => `/innovation/projects/${id}/members/${sid}`, { invalidate: inv });
  const removeEvidence = useApiMutation<string>('delete', (eid) => `/innovation/evidence/${eid}`, { invalidate: inv });
  const toggle = useApiMutation<{ id: string; completed: boolean }>('patch', (v) => `/innovation/milestones/${v.id}`, {
    invalidate: inv, body: (v) => ({ completed: v.completed }), success: (_r, v) => (v.completed ? 'Milestone completed' : 'Milestone reopened'),
  });

  if (q.isLoading) return <Page><PageSkeleton kpis={0} /></Page>;
  if (q.error || !q.data) return <Page><PageHead title="Project" crumbs={[{ label: 'Projects', to: '/projects' }]} /><ErrorState error={q.error} onRetry={q.refetch} /></Page>;
  const p = q.data;
  const done = p.milestones.filter((m) => m.completedOn).length;
  const nextStage = p.stage < 6 ? STAGES[p.stage + 1] : null;

  return (
    <Page>
      <PageHead title={p.title} crumbs={[{ label: 'Innovation Lab', to: '/innovation' }, { label: 'Projects', to: '/projects' }, { label: p.code }]}
        sub={<>{p.code} · {p.studentName} ({p.grade}{p.section}) · mentor {p.mentor ?? 'not assigned'} · {done}/{p.milestones.length} milestones</>}
        actions={<>
          <Button icon="user" to={`/student-360/${p.studentId}`}>Open Student 360</Button>
          {manage && <Button icon="edit" onClick={() => setModal('edit')}>Edit</Button>}
          {manage && nextStage && <Button variant="primary" icon="arrowRight" onClick={() => setModal('advance')}>Move to {nextStage}</Button>}
        </>} />
      <Card><Stepper steps={STAGES} active={p.stage >= 6 ? 7 : p.stage} /></Card>
      {p.summary && <p className="t-sm mt-3">{p.summary}</p>}

      <div className="grid g-2col g-5 mt-4">
        <div className="col g-4">
          <Card title="Milestones" sub={`${done} of ${p.milestones.length} complete`} tight
            actions={manage && <Button size="sm" icon="plus" onClick={() => { setEditMs(null); setModal('milestone'); }}>Add milestone</Button>}>
            {!p.milestones.length ? <Empty icon="flag" title="No milestones yet" sub="Break the project into checkpoints with due dates." /> : (
              <div className="timeline">
                {p.milestones.map((m) => (
                  <div className="timeline__item" key={m.id}>
                    <span className={`timeline__dot timeline__dot--${msTone(m.status)}`} />
                    <div className="timeline__time row between">
                      <span>{m.completedOn ? `Done ${fmt.date(m.completedOn)}` : m.dueOn ? `Due ${fmt.date(m.dueOn)}` : 'No due date'}</span>
                      <Status value={m.status} />
                    </div>
                    <div className="timeline__title">{m.title}</div>
                    {(m.evidence || m.feedback) && <div className="timeline__body">{m.evidence}{m.feedback && <div className="t-micro t-muted mt-1">Mentor: {m.feedback}</div>}</div>}
                    {manage && (
                      <div className="row g-2 mt-2">
                        <Checkbox checked={!!m.completedOn} disabled={toggle.isPending} label={m.completedOn ? 'Completed' : 'Mark complete'}
                          onChange={(c) => toggle.mutate({ id: m.id, completed: c })} />
                        <Button size="sm" variant="quiet" onClick={() => { setEditMs(m); setModal('milestone'); }}>Edit</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Evidence" tight actions={manage && <Button size="sm" icon="plus" onClick={() => setModal('evidence')}>Add evidence</Button>}>
            {!p.evidence.length ? <Empty icon="camera" title="No evidence yet" sub="Photos, test logs and judging sheets build the portfolio." /> : (
              <div className="grid g-3col g-3">
                {p.evidence.map((e) => (
                  <div key={e.id} className="card card--tint" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ height: 66, background: 'linear-gradient(135deg,var(--brand-tint),var(--accent-tint))', display: 'grid', placeItems: 'center', color: 'var(--brand)' }}>
                      <Icon name={KIND_ICON[e.kind] ?? 'fileText'} size={20} />
                    </div>
                    <div style={{ padding: 8 }}>
                      <div className="t-micro t-bold">{e.link ? <a href={e.link} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</div>
                      <div className="t-micro t-muted">{e.kind} · {fmt.dateShort(e.createdAt)}</div>
                      {manage && <button type="button" className="t-micro t-critical" onClick={async () => {
                        if (await confirm({ title: `Remove "${e.title}"?`, confirmLabel: 'Remove', danger: true })) removeEvidence.mutate(e.id);
                      }}>Remove</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="col g-4">
          <Card title="Mentor feedback" tight actions={manage && <Button size="sm" icon="message" onClick={() => setModal('feedback')}>Add feedback</Button>}>
            {!p.feedback.length ? <Empty icon="message" title="No feedback yet" /> : (
              <div className="col g-4">
                {p.feedback.map((fb) => (
                  <div className="row-top g-3" key={fb.id}>
                    <Avatar name={fb.author} size="sm" />
                    <div>
                      <div className="t-sm t-bold">{fb.author}</div>
                      <p className="t-sm mt-1" style={{ whiteSpace: 'pre-wrap' }}>{fb.body}</p>
                      <div className="t-micro t-muted mt-1">{fmt.date(fb.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Team" tight flush actions={manage && <Button size="sm" icon="plus" onClick={() => setModal('member')}>Add member</Button>}>
            <DataTable compact stack={false} rows={p.members} rowKey={(m) => m.studentId} columns={[
              { key: 'student', label: 'Student', render: (m) => <StudentLink id={m.studentId} name={m.studentName} meta={`${m.grade ?? ''}${m.section ?? ''} · ${m.admissionNo}`} /> },
              { key: 'role', label: 'Role', render: (m) => <Badge tone={m.role === 'Lead' ? 'info' : 'neutral'}>{m.role}</Badge> },
              { key: 'a', label: '', className: 'num', render: (m) => manage && m.role !== 'Lead' ? (
                <Button size="sm" variant="quiet" icon="x" aria-label={`Remove ${m.studentName}`} onClick={async () => {
                  if (await confirm({ title: `Remove ${m.studentName} from ${p.code}?`, confirmLabel: 'Remove', danger: true })) removeMember.mutate(m.studentId);
                }} />) : null },
            ]} />
          </Card>
          <Card title="Competitions" tight flush>
            {!p.competitions.length ? <div className="card__body"><span className="t-sm t-muted">Not entered in any competition yet.</span></div> : (
              <DataTable compact stack={false} rows={p.competitions} rowKey={(c) => c.id} columns={[
                { key: 'name', label: 'Competition', render: (c) => <><span className="t-bold">{c.name}</span><div className="t-micro t-muted">{c.level} · {fmt.date(c.heldOn)}</div></> },
                { key: 'result', label: 'Result', className: 'num', render: (c) => /place|finalist|winner|1st|2nd|3rd/i.test(c.result ?? '') ? <Badge tone="success" icon="award">{c.result}</Badge> : (c.result ?? '—') },
              ]} />
            )}
          </Card>
          <Card title="Achievement" tight>
            {!p.achievements.length ? <span className="t-sm t-muted">Recorded automatically when the project completes the Achievement stage.</span> : (
              <div className="col g-3">
                {p.achievements.map((a) => (
                  <div className="row g-3" key={a.id}>
                    <span className="avatar avatar--amber none"><Icon name="award" size={18} /></span>
                    <div>
                      <div className="t-sm t-bold">{a.title}</div>
                      <div className="t-micro t-muted">{fmt.date(a.achievedOn)} · {a.level ?? a.type} · {a.verified ? 'verified' : 'unverified'} · recorded on the Student 360 profile</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {modal === 'advance' && <AdvanceModal p={p} onClose={() => setModal(null)} />}
      {modal === 'milestone' && <MilestoneModal projectId={p.id} milestone={editMs} onClose={() => setModal(null)} />}
      {modal === 'evidence' && <EvidenceModal p={p} onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackModal projectId={p.id} onClose={() => setModal(null)} />}
      {modal === 'member' && <MemberModal projectId={p.id} onClose={() => setModal(null)} />}
      {modal === 'edit' && <EditModal p={p} onClose={() => setModal(null)} />}
    </Page>
  );
}

function AdvanceModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const next = p.stage + 1;
  const final = next === 6;
  const open = p.milestones.filter((m) => !m.completedOn).length;
  const f = useForm({ achievementTitle: final ? `${p.competitions[0]?.name ?? p.title} — ` : '', level: p.competitions[0]?.level ?? 'School', achievedOn: todayIso(), note: '' });
  const v = f.values;
  const save = useApiMutation<Record<string, unknown>>('post', `/innovation/projects/${p.id}/advance`, { invalidate: ['/innovation'] });
  const submit = async () => {
    if (final && !f.validate({
      achievementTitle: req(v.achievementTitle, 'Achievement') ?? (v.achievementTitle.trim().length < 6 ? 'Describe the achievement' : null),
      achievedOn: req(v.achievedOn, 'Date') ?? (v.achievedOn > todayIso() ? 'Cannot be in the future' : null),
    })) return;
    try {
      await save.mutateAsync(final ? { achievementTitle: v.achievementTitle.trim(), level: v.level, achievedOn: v.achievedOn, note: v.note || null } : { note: v.note || null });
      onClose();
    } catch (e) { f.fromError(e); }
  };
  return (
    <Modal open onClose={onClose} title={`Move ${p.code} to ${STAGES[next]}`} sub={`Currently ${STAGES[p.stage]}`} busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{final ? 'Record achievement' : `Move to ${STAGES[next]}`}</Button></>}>
      {open > 0 && <Banner tone="warning" icon="flag">{open} milestone(s) are still open.</Banner>}
      {final ? (
        <div className="mt-3">
          <p className="t-sm mb-3">Completing the project records a <strong>verified achievement</strong> on {p.studentName}’s Student 360 profile and notifies the family.</p>
          <TextField label="Achievement" required maxLength={160} value={v.achievementTitle} onChange={(x) => f.set('achievementTitle', x)} error={f.errors.achievementTitle} />
          <div className="mt-3">
            <FormGrid>
              <SelectField label="Level" value={v.level} onChange={(x) => f.set('level', x)} options={['School', 'District', 'State', 'National', 'International']} />
              <TextField label="Achieved on" type="date" required max={todayIso()} value={v.achievedOn} onChange={(x) => f.set('achievedOn', x)} error={f.errors.achievedOn} />
            </FormGrid>
          </div>
        </div>
      ) : <p className="t-sm mt-3">The stage change is recorded in the audit trail and shown in the lab pipeline.</p>}
      <div className="mt-3"><TextArea label="Note" rows={2} maxLength={300} value={v.note} onChange={(x) => f.set('note', x)} /></div>
    </Modal>
  );
}

function MilestoneModal({ projectId, milestone, onClose }: { projectId: string; milestone: Milestone | null; onClose: () => void }) {
  const f = useForm({ title: milestone?.title ?? '', dueOn: milestone?.dueOn ?? '', evidence: milestone?.evidence ?? '', feedback: milestone?.feedback ?? '' });
  const v = f.values;
  const save = useApiMutation<Record<string, unknown>>(milestone ? 'patch' : 'post', milestone ? `/innovation/milestones/${milestone.id}` : `/innovation/projects/${projectId}/milestones`,
    { invalidate: ['/innovation'], success: milestone ? 'Milestone updated' : 'Milestone added' });
  const del = useApiMutation<void>('delete', `/innovation/milestones/${milestone?.id}`, { invalidate: ['/innovation'], success: 'Milestone deleted' });
  const confirm = useConfirm();
  const submit = async () => {
    if (!f.validate({ title: req(v.title, 'Title') ?? (v.title.trim().length < 3 ? 'Title is too short' : null) })) return;
    const body = milestone
      ? { title: v.title.trim(), dueOn: v.dueOn || null, evidence: v.evidence || null, feedback: v.feedback || null }
      : { title: v.title.trim(), dueOn: v.dueOn || null };
    try { await save.mutateAsync(body); onClose(); } catch (e) { f.fromError(e); }
  };
  return (
    <Modal open onClose={onClose} title={milestone ? 'Edit milestone' : 'Add milestone'} busy={save.isPending || del.isPending}
      foot={<>
        {milestone && !milestone.completedOn && <Button variant="danger" onClick={async () => {
          if (await confirm({ title: `Delete "${milestone.title}"?`, confirmLabel: 'Delete', danger: true })) { try { await del.mutateAsync(); onClose(); } catch { /* toast */ } }
        }}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button>
      </>}>
      <FormGrid>
        <TextField label="Title" required maxLength={160} value={v.title} onChange={(x) => f.set('title', x)} error={f.errors.title} />
        <TextField label="Due on" type="date" value={v.dueOn} onChange={(x) => f.set('dueOn', x)} error={f.errors.dueOn} />
      </FormGrid>
      {milestone && <>
        <div className="mt-3"><TextArea label="Evidence summary" rows={2} maxLength={1000} value={v.evidence} onChange={(x) => f.set('evidence', x)} /></div>
        <div className="mt-3"><TextArea label="Mentor feedback" rows={2} maxLength={1000} value={v.feedback} onChange={(x) => f.set('feedback', x)} /></div>
      </>}
    </Modal>
  );
}

function EvidenceModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const f = useForm({ title: '', kind: 'Photo', link: '', note: '', milestoneId: '' });
  const v = f.values;
  const save = useApiMutation<Record<string, unknown>>('post', `/innovation/projects/${p.id}/evidence`, { invalidate: ['/innovation'], success: 'Evidence added' });
  const submit = async () => {
    if (!f.validate({
      title: req(v.title, 'Title'),
      link: v.link && !/^https?:\/\/\S+$/i.test(v.link) ? 'Enter a full http(s) link' : v.kind === 'Link' ? req(v.link, 'Link') : null,
    })) return;
    try { await save.mutateAsync({ title: v.title.trim(), kind: v.kind, link: v.link || null, note: v.note || null, milestoneId: v.milestoneId || null }); onClose(); } catch (e) { f.fromError(e); }
  };
  return (
    <Modal open onClose={onClose} title="Add evidence" sub="Evidence builds the student portfolio. Link to files held in the school drive." busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Add</Button></>}>
      <FormGrid>
        <TextField label="Title" required maxLength={160} value={v.title} onChange={(x) => f.set('title', x)} error={f.errors.title} />
        <SelectField label="Type" value={v.kind} onChange={(x) => f.set('kind', x)} options={['Photo', 'Video', 'Document', 'Test log', 'Judging sheet', 'Link']} />
        <TextField label="Link" type="url" maxLength={500} placeholder="https://" value={v.link} onChange={(x) => f.set('link', x)} error={f.errors.link} />
        <SelectField label="Milestone" value={v.milestoneId} onChange={(x) => f.set('milestoneId', x)} placeholder="Whole project"
          options={p.milestones.map((m) => ({ value: m.id, label: m.title }))} />
      </FormGrid>
      <div className="mt-3"><TextArea label="Note" rows={2} maxLength={500} value={v.note} onChange={(x) => f.set('note', x)} /></div>
    </Modal>
  );
}

function FeedbackModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const save = useApiMutation<Record<string, unknown>>('post', `/innovation/projects/${projectId}/feedback`, { invalidate: ['/innovation'], success: 'Feedback added' });
  return (
    <Modal open onClose={onClose} title="Mentor feedback" busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={async () => {
        if (body.trim().length < 5) { setErr('Write at least a sentence'); return; }
        try { await save.mutateAsync({ body: body.trim() }); onClose(); } catch { /* toast */ }
      }}>Post feedback</Button></>}>
      <TextArea label="Feedback" required rows={5} maxLength={2000} value={body} onChange={(x) => { setBody(x); setErr(''); }} error={err}
        placeholder="What is working, and the next concrete step" />
      <p className="t-xs t-muted mt-2">Feedback is visible to staff who can open this project.</p>
    </Modal>
  );
}

function MemberModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [student, setStudent] = useState<StudentPick | null>(null);
  const [role, setRole] = useState('Member');
  const [err, setErr] = useState('');
  const save = useApiMutation<Record<string, unknown>>('post', `/innovation/projects/${projectId}/members`, { invalidate: ['/innovation'], success: 'Member added' });
  return (
    <Modal open onClose={onClose} title="Add team member" busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={async () => {
        if (!student) { setErr('Choose a student'); return; }
        try { await save.mutateAsync({ studentId: student.id, role }); onClose(); } catch { /* toast */ }
      }}>Add</Button></>}>
      <StudentPicker required value={student} onChange={(s) => { setStudent(s); setErr(''); }} error={err} />
      <div className="mt-3"><SelectField label="Role" value={role} onChange={setRole} options={['Member', 'Designer', 'Researcher', 'Builder', 'Presenter']} /></div>
    </Modal>
  );
}

function EditModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const mentors = useMentorOptions();
  const f = useForm({ title: p.title, summary: p.summary ?? '', mentorId: p.mentorId ?? '' });
  const v = f.values;
  const save = useApiMutation<Record<string, unknown>>('patch', `/innovation/projects/${p.id}`, { invalidate: ['/innovation'], success: 'Project updated' });
  const submit = async () => {
    if (!f.validate({ title: req(v.title, 'Title'), mentorId: req(v.mentorId, 'Mentor') })) return;
    try { await save.mutateAsync({ title: v.title.trim(), summary: v.summary || null, mentorId: v.mentorId }); onClose(); } catch (e) { f.fromError(e); }
  };
  const options = mentors.some((m) => m.value === p.mentorId) || !p.mentorId ? mentors : [{ value: p.mentorId, label: p.mentor ?? 'Current mentor' }, ...mentors];
  return (
    <Modal open onClose={onClose} title={`Edit ${p.code}`} busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <TextField label="Title" required maxLength={160} value={v.title} onChange={(x) => f.set('title', x)} error={f.errors.title} />
      <div className="mt-3"><SelectField label="Mentor" required value={v.mentorId} onChange={(x) => f.set('mentorId', x)} options={options} error={f.errors.mentorId} /></div>
      <div className="mt-3"><TextArea label="Summary" rows={3} maxLength={1000} value={v.summary} onChange={(x) => f.set('summary', x)} /></div>
    </Modal>
  );
}
