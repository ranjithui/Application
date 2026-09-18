import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useLookups } from '@/hooks/useLookups';
import {
  Avatar, Badge, Banner, Button, Card, Chart, charts, Empty, ErrorState, InlineError, Modal, Page, PageHead, PageSkeleton,
  Segment, SelectField, Skeleton, Switch, TextField, useConfirm,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { useSections } from './shared';

interface Entry {
  id: string; sectionId: string; sectionLabel: string; day: number; periodNo: number; startsAt: string; endsAt: string;
  subjectId: string | null; subject: string | null; activity: string | null; employeeId: string | null; teacher: string | null;
  substituteId: string | null; substitute: string | null; room: string | null; needsSubstitute: boolean;
}
interface Timetable {
  title: string; campusId: string; days: string[];
  periods: { id: string; periodNo: number; startsAt: string; endsAt: string }[];
  entries: Entry[];
  conflicts: (Entry & { teacherStatus: string | null; date: string })[];
  today: { date: string; day: number };
}
interface Insights { teacherLoad: { id: string; name: string; periods: number; maxPeriods: number }[]; agreedLoad: number; utilisation: { filled: number; slots: number; pct: number } }
interface Suggestions {
  entry: { id: string; day: string; date: string; periodNo: number; section: string; subject: string | null; room: string | null; teacherStatus: string | null };
  suggestions: { id: string; name: string; reason: string; match: string; hasAccount: boolean }[];
}

const shortName = (n: string | null) => {
  if (!n) return '';
  const parts = n.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/, '').split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0];
};

export default function TimetablePage() {
  const { can, user } = useAuth();
  const { campusParam, campusId } = useSchool();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const schoolLevel = can('students.read') && user?.role.scope !== 'class';
  const sections = useSections(schoolLevel ? campusId : undefined);
  const mode = sp.get('view') === 'mine' && user?.employeeId ? 'mine' : 'class';
  const list = sections.data ?? [];
  const sectionId = sp.get('section') && list.some((s) => s.id === sp.get('section'))
    ? sp.get('section')!
    : (list.find((s) => s.isClassTeacher) ?? list[0])?.id;
  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const tt = useApiQuery<Timetable>(mode === 'mine' ? '/academics/timetable' : sectionId ? '/academics/timetable' : null, mode === 'mine' ? {} : { sectionId });
  const insights = useApiQuery<Insights>('/academics/timetable/insights', campusParam);
  const [subFor, setSubFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const publish = useApiMutation<{ sectionId: string }, { notified: number }>('post', '/academics/timetable/publish', {
    success: (r) => `Timetable changes published — ${r.data.notified} teacher${r.data.notified === 1 ? '' : 's'} notified`,
  });

  const d = tt.data;
  const grid = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of d?.entries ?? []) m.set(`${e.day}:${e.periodNo}`, e);
    return m;
  }, [d]);
  const conflict = d?.conflicts[0];
  const canManage = can('academics.manage');

  const doPublish = async () => {
    if (!sectionId || !d) return;
    const ok = await confirm({ title: `Publish timetable changes for ${d.title}?`, body: 'Every teacher on this timetable is notified to check their periods.', confirmLabel: 'Publish changes', icon: 'check' });
    if (ok) publish.mutate({ sectionId });
  };

  if (sections.isLoading) return <Page><PageSkeleton kpis={0} /></Page>;
  if (sections.error) return <Page><ErrorState error={sections.error} onRetry={() => sections.refetch()} /></Page>;

  return (
    <Page>
      <PageHead
        title="Timetable"
        sub="Days by periods, with teacher, room, conflicts and substitute suggestions."
        actions={<>
          {user?.employeeId && (
            <Segment items={[{ id: 'class', label: 'Class' }, { id: 'mine', label: 'My timetable' }]} active={mode} onChange={(v) => setParam('view', v === 'mine' ? v : null)} />
          )}
          {mode === 'class' && list.length > 0 && (
            <select className="select" aria-label="Class" value={sectionId ?? ''} style={{ width: 'auto', minWidth: 140 }} onChange={(e) => setParam('section', e.target.value)}>
              {list.map((s) => <option key={s.id} value={s.id}>{s.label}{schoolLevel && !campusParam.campusId ? ` · ${s.campusName}` : ''}</option>)}
            </select>
          )}
          {schoolLevel && canManage && mode === 'class' && sectionId && (
            <Button variant="primary" icon="check" onClick={doPublish} loading={publish.isPending}>Publish changes</Button>
          )}
        </>}
      />

      {mode === 'class' && list.length === 0 ? (
        <Card><Empty icon="calendar" title="No classes to show" sub="You are not assigned to any section yet." /></Card>
      ) : tt.error ? <ErrorState error={tt.error} onRetry={() => tt.refetch()} /> : !d ? <Skeleton height={420} /> : (
        <>
          {conflict ? (
            <Banner tone="warning" icon="alert">
              <strong>{d.conflicts.length} conflict{d.conflicts.length === 1 ? '' : 's'}.</strong>{' '}
              {conflict.day ? `${d.days[conflict.day - 1]} Period ${conflict.periodNo}` : ''}, {conflict.sectionLabel} {conflict.subject ?? conflict.activity} has no teacher
              {conflict.teacher ? ` — ${conflict.teacher} is ${conflict.teacherStatus ? conflict.teacherStatus.toLowerCase() : 'unavailable'}` : ''}.
              {canManage ? ' A substitute suggestion is ready.' : ''}
            </Banner>
          ) : (
            <Banner tone="success" icon="check">No conflicts. Every period {mode === 'mine' ? 'on your timetable' : `for ${d.title}`} has a teacher.</Banner>
          )}

          <div className="mt-4">
            <Card flush title={mode === 'mine' ? `My timetable — ${d.title}` : d.title} sub={`${d.entries.length} periods a week · today is ${fmt.date(d.today.date)}`}>
              {d.periods.length === 0 ? <Empty icon="clock" title="No periods configured for this campus" /> : (
                <div className="table-wrap">
                  <table className="table table--compact" style={{ minWidth: 860 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 96 }}>Period</th>
                        {d.days.map((day, i) => <th key={day} style={i + 1 === d.today.day ? { color: 'var(--magenta)' } : undefined}>{day}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {d.periods.map((p) => (
                        <tr key={p.id}>
                          <td className="t-micro t-muted t-num t-nowrap">P{p.periodNo} · {p.startsAt}–{p.endsAt}</td>
                          {d.days.map((day, di) => {
                            const e = grid.get(`${di + 1}:${p.periodNo}`);
                            const conflictCell = !!e && e.needsSubstitute && !e.substituteId;
                            const free = !e;
                            const label = e ? e.subject ?? e.activity ?? '—' : 'Free';
                            const who = e ? (e.substituteId ? `Cover: ${shortName(e.substitute)}` : conflictCell ? 'SUBSTITUTE NEEDED' : shortName(e.teacher) || 'Various') : '';
                            const meta = [mode === 'mine' && e ? e.sectionLabel : null, who, e?.room].filter(Boolean).join(' · ');
                            const clickable = !!e && canManage && (conflictCell || !!e.substituteId || schoolLevel);
                            return (
                              <td key={day} style={{ padding: 6 }}>
                                <button type="button" className={`card ${clickable ? 'card--link' : ''}`} disabled={!clickable}
                                  aria-label={`${day} period ${p.periodNo}: ${label}${meta ? `, ${meta}` : ''}`}
                                  style={{
                                    width: '100%', padding: '8px 10px', textAlign: 'left', borderRadius: 'var(--r-sm)', cursor: clickable ? 'pointer' : 'default',
                                    ...(conflictCell ? { background: 'var(--critical-tint)', borderColor: 'var(--critical-line)' } : free ? { background: 'var(--surface-alt)' } : e?.substituteId ? { background: 'var(--warning-tint, var(--surface-alt))' } : {}),
                                  }}
                                  onClick={() => { if (!e) return; if (conflictCell || e.substituteId) setSubFor(e.id); else setEditing(e); }}>
                                  <span className="t-xs t-bold" style={{ display: 'block' }}>{label}</span>
                                  <span className="t-micro t-muted" style={{ display: 'block' }}>{meta}</span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="grid g-3col g-4 mt-4">
        <Card title="Teacher load" sub="Periods per week">
          {insights.error ? <ErrorState error={insights.error} onRetry={() => insights.refetch()} /> : !insights.data ? <Skeleton height={180} /> : insights.data.teacherLoad.length === 0 ? (
            <Empty icon="users" title="No timetabled teachers" />
          ) : (
            <>
              <Chart svg={charts.hbar({
                rows: insights.data.teacherLoad.map((t) => ({ label: shortName(t.name), value: t.periods, color: t.periods > t.maxPeriods ? 'var(--critical)' : t.periods >= t.maxPeriods - 2 ? 'var(--amber)' : 'var(--navy)' })),
                labelW: 110, rowH: 28,
              })} />
              <p className="t-micro t-muted mt-3">Above {insights.data.agreedLoad} periods is over the agreed load.</p>
            </>
          )}
        </Card>
        <Card title="Timetable utilisation" sub="Scheduled periods across timetabled classes">
          {!insights.data ? <Skeleton height={160} /> : (
            <div className="row center">
              <Chart svg={charts.donut({
                size: 160, thickness: 22, center: `${insights.data.utilisation.pct}%`, centerSub: 'Scheduled',
                data: [
                  { label: 'Scheduled', value: insights.data.utilisation.filled, color: 'var(--teal)' },
                  { label: 'Free', value: Math.max(0, insights.data.utilisation.slots - insights.data.utilisation.filled), color: 'var(--bg-sunken)' },
                ],
              })} />
            </div>
          )}
        </Card>
        <Card title="Substitute suggestions" sub={conflict ? `For ${d?.days[conflict.day - 1]} Period ${conflict.periodNo}` : 'No open conflicts'}>
          {conflict && canManage ? <SuggestionList entryId={conflict.id} onAssigned={() => undefined} compact /> : (
            <Empty icon="shieldCheck" title={conflict ? 'Cover is arranged by the academic office' : 'Nothing needs cover'} />
          )}
        </Card>
      </div>

      {subFor && d && <SubstituteModal entry={d.entries.find((e) => e.id === subFor)!} dayName={d.days[(d.entries.find((e) => e.id === subFor)?.day ?? 1) - 1]} onClose={() => setSubFor(null)} />}
      {editing && <EditEntryModal entry={editing} dayName={d?.days[editing.day - 1] ?? ''} onClose={() => setEditing(null)} />}
    </Page>
  );
}

// ---------------------------------------------------------------------------
function SuggestionList({ entryId, onAssigned, compact, selected, onSelect }: {
  entryId: string; onAssigned: () => void; compact?: boolean; selected?: string; onSelect?: (id: string) => void;
}) {
  const confirm = useConfirm();
  const q = useApiQuery<Suggestions>(`/academics/timetable/entries/${entryId}/substitutes`);
  const assign = useApiMutation<{ substituteId: string }>('post', `/academics/timetable/entries/${entryId}/substitute`, {
    invalidate: ['/academics/timetable', '/academics/teacher-dashboard'], onSuccess: onAssigned,
  });
  if (q.isLoading) return <div className="col g-2">{[0, 1, 2].map((i) => <Skeleton key={i} height={48} />)}</div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;
  if (!s.suggestions.length) return <Empty icon="users" title="No free teachers in this period" sub="Consider merging the class for this period." />;
  return (
    <div className="col g-2">
      {s.suggestions.map((x) => {
        const content = (
          <>
            <Avatar name={x.name} size="sm" />
            <span className="col grow" style={{ minWidth: 0 }}>
              <span className="t-sm t-bold">{x.name}</span>
              <span className="t-micro t-muted">{x.reason}</span>
            </span>
          </>
        );
        if (compact) {
          return (
            <button key={x.id} type="button" className="card card--link row g-3" style={{ padding: '10px 12px', textAlign: 'left' }} disabled={assign.isPending}
              onClick={async () => {
                const ok = await confirm({ title: `Assign ${x.name} as cover?`, body: `${s.entry.day} Period ${s.entry.periodNo} · ${s.entry.section} ${s.entry.subject ?? ''}. ${x.hasAccount ? `${x.name} will be notified.` : ''}`, confirmLabel: 'Assign cover' });
                if (ok) assign.mutate({ substituteId: x.id });
              }}>
              {content}
              <Badge tone={x.match}>Assign</Badge>
            </button>
          );
        }
        return (
          <label key={x.id} className="check card card--tint row g-3" style={{ padding: '10px 12px', cursor: 'pointer' }}>
            <input type="radio" name="substitute" checked={selected === x.id} onChange={() => onSelect?.(x.id)} />
            {content}
            <Badge tone={x.match}>{x.match === 'success' ? 'Best match' : x.match === 'info' ? 'Good match' : 'Available'}</Badge>
          </label>
        );
      })}
    </div>
  );
}

function SubstituteModal({ entry, dayName, onClose }: { entry: Entry; dayName: string; onClose: () => void }) {
  const confirm = useConfirm();
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const covered = !!entry.substituteId;
  const assign = useApiMutation<{ substituteId: string; note?: string }>('post', `/academics/timetable/entries/${entry.id}/substitute`, {
    invalidate: ['/academics/timetable', '/academics/teacher-dashboard'], onSuccess: onClose,
  });
  const remove = useApiMutation<void>('delete', `/academics/timetable/entries/${entry.id}/substitute`, {
    invalidate: ['/academics/timetable', '/academics/teacher-dashboard'], onSuccess: onClose,
  });
  const q = useApiQuery<Suggestions>(`/academics/timetable/entries/${entry.id}/substitutes`);
  const what = `${entry.sectionLabel} ${entry.subject ?? entry.activity ?? ''}`.trim();

  return (
    <Modal open onClose={onClose} busy={assign.isPending || remove.isPending} size="wide"
      title={covered ? 'Cover arranged' : 'Timetable conflict'}
      sub={`${dayName} · Period ${entry.periodNo} · ${what} · Room ${entry.room ?? '—'}`}
      foot={<>
        <Button onClick={onClose}>Cancel</Button>
        {covered ? (
          <Button variant="danger" loading={remove.isPending} onClick={async () => {
            const ok = await confirm({ title: 'Remove this cover?', body: `${entry.substitute} will no longer cover ${what}. The period is flagged as needing a substitute again.`, confirmLabel: 'Remove cover', danger: true });
            if (ok) remove.mutate();
          }}>Remove cover</Button>
        ) : (
          <Button variant="primary" loading={assign.isPending} onClick={() => {
            if (!selected) { setError('Choose a teacher to cover this period'); return; }
            if (note.length > 200) { setError('Keep the note under 200 characters'); return; }
            assign.mutate({ substituteId: selected, note: note.trim() || undefined });
          }}>Assign cover</Button>
        )}
      </>}>
      {covered ? (
        <Banner tone="success" icon="check">{entry.substitute} is covering this period{entry.teacher ? ` for ${entry.teacher}` : ''}.</Banner>
      ) : (
        <>
          <Banner tone="critical" icon="alert">
            {entry.teacher ? `${entry.teacher} is ${q.data?.entry.teacherStatus?.toLowerCase() ?? 'unavailable'} on ${q.data ? fmt.date(q.data.entry.date) : dayName}.` : 'No teacher is assigned.'} No teacher is covering this period.
          </Banner>
          <div className="mt-4">
            <div className="eyebrow mb-2">Suggested cover</div>
            <SuggestionList entryId={entry.id} onAssigned={onClose} selected={selected} onSelect={(id) => { setSelected(id); setError(''); }} />
            {error && <p className="t-xs mt-2" role="alert" style={{ color: 'var(--critical)' }}>{error}</p>}
          </div>
          <div className="mt-4">
            <TextField label="Note for the substitute" value={note} onChange={setNote} maxLength={200} placeholder="e.g. Worksheet 3 is on the desk" />
          </div>
          {assign.error && <div className="mt-3"><InlineError error={assign.error} /></div>}
        </>
      )}
    </Modal>
  );
}

function EditEntryModal({ entry, dayName, onClose }: { entry: Entry; dayName: string; onClose: () => void }) {
  const { lookups } = useLookups();
  const [f, setF] = useState({ subjectId: entry.subjectId ?? '', activity: entry.activity ?? '', employeeId: entry.employeeId ?? '', room: entry.room ?? '', needsSubstitute: entry.needsSubstitute });
  const [error, setError] = useState('');
  const save = useApiMutation<Record<string, unknown>>('put', `/academics/timetable/entries/${entry.id}`, {
    invalidate: ['/academics/timetable', '/academics/teacher-dashboard'], success: 'Timetable updated', onSuccess: onClose, error: false,
  });
  useEffect(() => { if (save.error) setError((save.error as Error).message); }, [save.error]);
  const submit = () => {
    if (!f.subjectId && !f.activity.trim()) { setError('Choose a subject or enter an activity'); return; }
    save.mutate({ subjectId: f.subjectId || null, activity: f.subjectId ? null : f.activity.trim(), employeeId: f.employeeId || null, room: f.room.trim() || null, needsSubstitute: f.needsSubstitute });
  };
  return (
    <Modal open onClose={onClose} busy={save.isPending} title={`Edit ${dayName} Period ${entry.periodNo}`} sub={entry.sectionLabel}
      foot={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" onClick={submit} loading={save.isPending}>Save</Button></>}>
      {error && <div className="mb-3"><Banner tone="critical" icon="alert">{error}</Banner></div>}
      <div className="grid g-2col g-3">
        <SelectField label="Subject" value={f.subjectId} onChange={(v) => setF((x) => ({ ...x, subjectId: v }))} placeholder="Activity (no subject)"
          options={(lookups?.subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <TextField label="Activity" value={f.activity} onChange={(v) => setF((x) => ({ ...x, activity: v }))} disabled={!!f.subjectId} placeholder="Games, Library, Club…" maxLength={40} />
        <SelectField label="Teacher" value={f.employeeId} onChange={(v) => setF((x) => ({ ...x, employeeId: v }))} placeholder="No teacher"
          options={(lookups?.staff ?? []).filter((s) => s.employeeType === 'teaching').map((s) => ({ value: s.id, label: s.fullName }))} />
        <TextField label="Room" value={f.room} onChange={(v) => setF((x) => ({ ...x, room: v }))} maxLength={40} />
      </div>
      <div className="mt-3">
        <Switch checked={f.needsSubstitute} onChange={(v) => setF((x) => ({ ...x, needsSubstitute: v }))} label="This period needs a substitute" />
      </div>
    </Modal>
  );
}
