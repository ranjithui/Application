import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useLookups } from '@/hooks/useLookups';
import { useAuth } from '@/auth/AuthContext';
import {
  Badge, Banner, Button, Card, Dl, Empty, ErrorState, Feed, Modal, SelectField, Skeleton, Status, Stepper, TextArea, Timeline, useConfirm,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { ApplicationCard, DocumentsCard } from './ApplicationPanel';
import { CloseFollowUpModal, CommunicationModal, FollowUpModal, StageModal } from './LeadForms';
import { ScoreCell, SourceBadge, stageTone, useCounsellors, useLeadParam } from './shared';
import { STAGES, type FollowUp, type LeadProfile } from './types';

const CHANNEL_ICON: Record<string, string> = { WhatsApp: 'message', Call: 'phone', Email: 'mail', SMS: 'message', Note: 'edit', 'In-app': 'bell' };
const INVALIDATE = ['/enquiries', '/admissions', '/applications', '/visits', '/follow-ups', '/referrals'];

/** Mount once per admissions page: opens the lead profile when ?lead= is present. */
export function LeadProfileHost() {
  const { leadCode, closeLead } = useLeadParam();
  if (!leadCode) return null;
  return <LeadProfileModal code={leadCode} onClose={closeLead} />;
}

function LeadProfileModal({ code, onClose }: { code: string; onClose: () => void }) {
  const q = useApiQuery<LeadProfile>(`/enquiries/${encodeURIComponent(code)}`);
  const navigate = useNavigate();
  const { can } = useAuth();
  const manage = can('admissions.manage');
  const [stageTarget, setStageTarget] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const l = q.data;
  const nextStage = l && l.stageIndex >= 0 && l.stageIndex < STAGES.length - 2 ? STAGES[l.stageIndex + 1] : undefined;

  return (
    <Modal open onClose={onClose} size="full"
      title={l ? `${l.studentName} — ${l.grade}` : code}
      sub={l ? `${l.code} · created ${fmt.date(l.createdAt)} · lead score ${l.score}` : 'Loading lead…'}
      foot={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button icon="user" disabled={!l?.studentId} onClick={() => navigate(`/student-360/${l!.studentId}`)}>Open Student 360</Button>
          {manage && l && !['Enrolled', 'Lost'].includes(l.stage) && (
            <>
              <Button icon="phone" onClick={() => setLogging(true)}>Log a call</Button>
              <Button icon="layers" onClick={() => setStageTarget('')}>Change stage</Button>
              {nextStage && (
                <Button variant="primary" iconRight="arrowRight" onClick={() => setStageTarget(nextStage)}>Move to {nextStage}</Button>
              )}
            </>
          )}
          {manage && l?.stage === 'Lost' && <Button icon="refresh" onClick={() => setStageTarget('Contacted')}>Reopen lead</Button>}
        </>
      }>
      {q.isLoading ? (
        <div className="col g-4" aria-busy="true"><Skeleton height={40} /><Skeleton height={260} /></div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We could not load this lead" />
      ) : l ? (
        <>
          <div className="mb-5">
            {l.stage === 'Lost'
              ? <Banner tone="critical" icon="x"><strong>Closed as lost.</strong> {l.lostReason ?? 'No reason recorded.'}</Banner>
              : <Stepper steps={[...STAGES]} active={l.stageIndex} />}
          </div>
          <div className="grid g-2col g-5">
            <div className="col g-4">
              <LeadDetail lead={l} />
              <ApplicationCard lead={l} />
              <DocumentsCard app={l.application} />
            </div>
            <div className="col g-4">
              <Card title="Communication history" tight actions={manage && !['Enrolled'].includes(l.stage) ? <Button size="sm" icon="plus" onClick={() => setLogging(true)}>Log</Button> : undefined}>
                {l.communications.length ? (
                  <Feed items={l.communications.map((c) => ({
                    time: fmt.relative(c.occurredAt),
                    icon: c.automated ? 'sparkle' : CHANNEL_ICON[c.channel] ?? 'message',
                    text: `${c.channel} — ${c.subject}`,
                    meta: [c.sentBy, c.body, c.status !== 'Internal' ? c.status : null].filter(Boolean).join(' · '),
                  }))} />
                ) : <p className="t-sm t-muted">No communication recorded yet.</p>}
              </Card>
              <FollowUps lead={l} />
              <Card title="Stage history" tight>
                <Timeline items={l.history.map((h) => ({
                  time: `${fmt.dateTime(h.changedAt)}${h.changedBy ? ` · ${h.changedBy}` : ''}`,
                  title: h.fromStage ? `${h.fromStage} → ${h.toStage}` : h.toStage,
                  body: h.note ?? undefined,
                  tone: h.toStage === 'Lost' ? 'critical' : h.toStage === 'Enrolled' ? 'teal' : 'neutral',
                }))} />
              </Card>
            </div>
          </div>
          {stageTarget !== null && <StageModal lead={l} initial={stageTarget || undefined} onClose={() => setStageTarget(null)} />}
          {logging && <CommunicationModal leadCode={l.code} onClose={() => setLogging(false)} />}
        </>
      ) : null}
    </Modal>
  );
}

function LeadDetail({ lead: l }: { lead: LeadProfile }) {
  const { can } = useAuth();
  const { lookups } = useLookups();
  const counsellors = useCounsellors();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(l.counsellorId ?? '');
  const assign = useApiMutation<{ counsellorId: string | null }, { counsellor: string | null; notified: boolean }>('post', `/enquiries/${l.code}/assign`, {
    invalidate: INVALIDATE,
    success: (r) => (r.data.counsellor ? `Assigned to ${r.data.counsellor}${r.data.notified ? ' — notified' : ''}` : 'Counsellor removed'),
    onSuccess: () => setEditing(false),
  });
  const manage = can('admissions.manage') && !['Enrolled', 'Lost'].includes(l.stage);
  const campus = lookups?.campuses.find((c) => c.id === l.campusId)?.name ?? l.campusName;

  const counsellorCell = editing ? (
    <span className="row g-2 wrap">
      <SelectField value={choice} onChange={setChoice} placeholder="Unassigned" style={{ minWidth: 180, marginBottom: 0 }}
        options={(counsellors.data ?? []).map((c) => ({ value: c.id, label: `${c.fullName} · ${c.openLeads} open` }))} />
      <Button size="sm" variant="primary" loading={assign.isPending} disabled={choice === (l.counsellorId ?? '')}
        onClick={async () => {
          if (!choice && !(await confirm({ title: 'Remove the counsellor?', body: 'The lead will show as unassigned until someone takes it.', confirmLabel: 'Remove', danger: true }))) return;
          assign.mutate({ counsellorId: choice || null });
        }}>Save</Button>
      <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
    </span>
  ) : (
    <span className="row g-2">
      {l.counsellor ?? <Badge tone="critical">Unassigned</Badge>}
      {manage && <Button size="sm" variant="quiet" icon="userCheck" onClick={() => { setChoice(l.counsellorId ?? ''); setEditing(true); }}>{l.counsellor ? 'Reassign' : 'Assign'}</Button>}
    </span>
  );

  return (
    <Card title="Lead detail" tight actions={<Badge tone={stageTone(l.stage)}>{l.stage}</Badge>}>
      <Dl items={[
        ['Parent', l.parentName],
        ['Phone', <a key="p" href={`tel:${l.phone.replace(/\s/g, '')}`}>{l.phone}</a>],
        ['Email', l.email ?? '—'],
        ['Student', `${l.studentName}${l.studentDob ? ` · born ${fmt.date(l.studentDob)}` : ''}`],
        ['Grade applied', l.grade],
        ['Curriculum', l.curriculum ?? '—'],
        ['Preferred campus', campus],
        ['Transport', l.transportRequired ? 'Required' : 'Not required'],
        ['Source', <SourceBadge key="s" source={l.source} />],
        ['Campaign', l.campaign ?? '—'],
        ['Referred by', l.referredBy ? `${l.referredBy.parentName} (recognition: ${l.referredBy.rewardStatus})` : '—'],
        ['Lead score', <ScoreCell key="sc" score={l.score} />],
        ['Counsellor', counsellorCell],
        ['Next action', l.nextAction ? <span key="n" className={l.overdue ? 't-critical t-bold' : ''}>{l.nextAction}{l.overdue ? ' · overdue' : ''}</span> : '—'],
        ...(l.notes ? [['Notes', l.notes] as [string, string]] : []),
      ]} />
    </Card>
  );
}

function FollowUps({ lead: l }: { lead: LeadProfile }) {
  const { can } = useAuth();
  const manage = can('admissions.manage') && !['Enrolled', 'Lost'].includes(l.stage);
  const [adding, setAdding] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ f: FollowUp; status: 'Completed' | 'Missed' | 'Cancelled' } | null>(null);
  const [note, setNote] = useState('');
  const addNote = useApiMutation<Record<string, unknown>>('post', `/enquiries/${l.code}/communications`, {
    invalidate: INVALIDATE, success: 'Note added', onSuccess: () => setNote(''),
  });
  return (
    <Card title="Follow-up tasks" tight actions={manage ? (
      <span className="row g-2">
        <Button size="sm" icon="calendar" onClick={() => setAdding('Campus Visit')}>Visit</Button>
        <Button size="sm" icon="plus" onClick={() => setAdding('')}>Follow-up</Button>
      </span>
    ) : undefined}>
      {l.followUps.length ? (
        <div className="col g-2">
          {l.followUps.map((f) => (
            <div key={f.id} className="row between g-2 wrap">
              <span className="t-sm grow" style={{ minWidth: 180 }}>
                <strong>{f.type}</strong> — {fmt.dateTime(f.scheduledAt)}
                <span className="t-micro t-muted" style={{ display: 'block' }}>
                  {[f.notes, f.outcome && `Outcome: ${f.outcome}`, f.assignedName ?? (f.status === 'Scheduled' ? 'No one assigned' : null)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="row g-1">
                {f.overdue ? <Badge tone="critical">Overdue</Badge> : <Status value={f.status} />}
                {manage && f.status === 'Scheduled' && (
                  <>
                    <Button size="sm" icon="check" onClick={() => setClosing({ f, status: 'Completed' })} aria-label={`Complete ${f.type}`}>Done</Button>
                    <Button size="sm" variant="quiet" onClick={() => setClosing({ f, status: f.type === 'Campus Visit' ? 'Missed' : 'Cancelled' })}>
                      {f.type === 'Campus Visit' ? 'No-show' : 'Cancel'}
                    </Button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : <Empty icon="calendar" title="No follow-ups" sub="Schedule the next call or campus visit." />}
      {manage && (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 2) addNote.mutate({ channel: 'Note', subject: note.trim() }); }}>
          <TextArea label="Add a note" rows={2} value={note} onChange={setNote} maxLength={200} placeholder="What did the parent say?" />
          <div className="row mt-2" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" type="submit" icon="edit" loading={addNote.isPending} disabled={note.trim().length < 2}>Save note</Button>
          </div>
        </form>
      )}
      {adding !== null && (
        <FollowUpModal leadCode={l.code} leadName={l.studentName} counsellorId={l.counsellorId} type={adding || undefined} onClose={() => setAdding(null)} />
      )}
      {closing && <CloseFollowUpModal followUp={closing.f} status={closing.status} onClose={() => setClosing(null)} />}
    </Card>
  );
}
