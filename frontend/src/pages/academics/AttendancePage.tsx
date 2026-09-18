import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  Badge, Banner, Button, Card, Chart, charts, Empty, ErrorState, Grid, Icon, Kpi, Meter, Modal, Page, PageHead,
  PageSkeleton, Segment, Skeleton, StudentLink, Timeline, useConfirm,
} from '@/components/ui';
import { fmt, todayKey } from '@/lib/format';
import { plural, ratio } from './shared';

type Status = 'present' | 'late' | 'absent' | 'leave';

interface SectionRow { id: string; label: string; campusName: string; students: number; marked: number; status: string }
interface RegisterStudent { id: string; admissionNo: string; fullName: string; roll: number | null; status: Status | null; arrivalTime: string | null; parentNotifiedAt: string | null; risk: string }
interface Register {
  section: { id: string; label: string; room: string | null };
  date: string;
  isToday: boolean;
  period: { periodNo: number; startsAt: string; endsAt: string; subject: string | null; room: string | null; teacher: string | null } | null;
  students: RegisterStudent[];
  summary: Record<Status | 'total' | 'unmarked', number>;
  lastMarkedBy: { name: string; at: string } | null;
  editable: boolean;
  readOnlyReason: string | null;
}
interface SaveResult { date: string; section: string; saved: number; changed: number; counts: Record<Status, number>; absenceAlerts: number; lateNotices: number; notificationsQueued: number; signalsRaised: { code: string; reason: string }[] }
interface Summary { sections: number; sectionsMarked: number; students: number; marked: number; present: number; late: number; absent: number; leave: number }

const STATUS_BTN: { id: Status; label: string; color: string }[] = [
  { id: 'present', label: 'Present', color: 'var(--teal)' },
  { id: 'late', label: 'Late', color: 'var(--amber)' },
  { id: 'absent', label: 'Absent', color: 'var(--critical)' },
  { id: 'leave', label: 'Leave', color: 'var(--info)' },
];
const AUTOMATION_STEPS = ['Teacher marks attendance', 'Attendance saved', 'Absent student identified', 'WhatsApp parent alert', 'Pattern analysed', 'Early Warning if required', 'Teacher intervention', 'Action recorded in Student 360'];

export default function AttendancePage() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'analytics' && can('students.read') ? 'analytics' : 'mark';
  const [automation, setAutomation] = useState(false);
  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const segment = can('students.read') ? (
    <Segment items={[{ id: 'mark', label: 'Mark attendance' }, { id: 'analytics', label: 'Analytics' }]} active={view} onChange={(v) => setParam('view', v === 'mark' ? null : v)} />
  ) : null;

  return (
    <Page>
      {view === 'analytics' ? (
        <>
          <PageHead title="Attendance analytics" sub="Campus, class, trend, late arrivals and absence patterns." actions={segment} />
          <AttendanceAnalytics />
        </>
      ) : (
        <>
          <PageHead
            title="Attendance"
            sub="One tap per student. Absences notify parents automatically and feed the Early Warning check."
            actions={<>{segment}<Button icon="zap" onClick={() => setAutomation(true)}>Attendance automation</Button></>}
          />
          <MarkAttendance sectionParam={sp.get('section')} dateParam={sp.get('date')} setParam={setParam} onAnalytics={() => setParam('view', 'analytics')} />
        </>
      )}
      <Modal open={automation} onClose={() => setAutomation(false)} title="Attendance automation" size="wide"
        foot={<>{can('dashboard.group') && <Button to="/automations">See all automations</Button>}<Button variant="primary" onClick={() => setAutomation(false)}>Close</Button></>}>
        <div className="col g-2">
          {AUTOMATION_STEPS.map((s, i) => (
            <div key={s} className="row g-3">
              <span className="stepper__num" style={{ background: 'var(--navy)', color: '#fff' }}>{i + 1}</span>
              <span className="t-sm t-bold grow">{s}</span>
              <Icon name={i < AUTOMATION_STEPS.length - 1 ? 'arrowDown' : 'check'} size={14} className="t-faint" />
            </div>
          ))}
        </div>
        <p className="t-xs t-muted mt-4">Parent alerts are queued in the notification outbox and sent through the configured WhatsApp and push providers. Early Warning signals are raised for review only — nothing is applied to a student automatically.</p>
      </Modal>
    </Page>
  );
}

// ---------------------------------------------------------------------------
function MarkAttendance({ sectionParam, dateParam, setParam, onAnalytics }: {
  sectionParam: string | null; dateParam: string | null; setParam: (k: string, v: string | null) => void; onAnalytics: () => void;
}) {
  const { can } = useAuth();
  const { campusParam } = useSchool();
  const confirm = useConfirm();
  const todayStr = todayKey();
  const date = dateParam && dateParam <= todayStr ? dateParam : todayStr;
  const sections = useApiQuery<SectionRow[]>('/attendance/sections', { ...campusParam, date });
  const list = sections.data ?? [];
  const sectionId = sectionParam && list.some((s) => s.id === sectionParam)
    ? sectionParam
    : (list.find((s) => s.status === 'Not marked') ?? list.find((s) => s.status === 'Pending') ?? list[0])?.id;

  // Keep the chosen section in the URL so it stays selected after the register is saved.
  useEffect(() => {
    if (!sectionParam && sectionId) setParam('section', sectionId);
  }, [sectionParam, sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reg = useApiQuery<Register>(sectionId ? '/attendance/register' : null, { sectionId, date });
  const summary = useApiQuery<Summary>('/attendance/summary', { ...campusParam, date: todayStr });
  const [marks, setMarks] = useState<Record<string, Status | null>>({});
  const [result, setResult] = useState<SaveResult | null>(null);

  const r = reg.data;
  useEffect(() => {
    if (!r) return;
    setMarks(Object.fromEntries(r.students.map((s) => [s.id, s.status])));
  }, [r]);
  useEffect(() => setResult(null), [sectionId, date]);

  const save = useApiMutation<{ sectionId: string; date: string; marks: { studentId: string; status: Status }[] }, SaveResult>('put', '/attendance/register', {
    invalidate: ['/attendance', '/academics/teacher-dashboard', '/academics/classes', '/notifications'],
    success: 'Attendance saved',
    onSuccess: (res) => setResult(res.data),
  });

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 };
    for (const v of Object.values(marks)) c[v ?? 'unmarked']++;
    return c;
  }, [marks]);
  const dirty = !!r && r.students.some((s) => (marks[s.id] ?? null) !== s.status);
  const newlyAlerted = r ? r.students.filter((s) => {
    const m = marks[s.id];
    return (m === 'absent' || m === 'late') && m !== s.status;
  }) : [];

  const setAll = (st: Status | 'reset') => {
    if (!r) return;
    setMarks(Object.fromEntries(r.students.map((s) => [s.id, st === 'reset' ? s.status : st])));
    setResult(null);
  };

  const submit = async () => {
    if (!r || !sectionId) return;
    if (counts.unmarked > 0) return;
    const absent = newlyAlerted.filter((s) => marks[s.id] === 'absent').length;
    const late = newlyAlerted.length - absent;
    if (!r.isToday || newlyAlerted.length) {
      const ok = await confirm({
        title: r.isToday ? 'Save attendance and alert parents?' : `Change the register for ${fmt.date(r.date)}?`,
        body: (
          <div className="col g-2">
            {!r.isToday && <p className="t-sm">You are editing a past register. The change is recorded against your name in the audit trail.</p>}
            {newlyAlerted.length > 0 && (
              <p className="t-sm">Parents of <strong>{plural(absent, 'absent student')}</strong>{late ? <> and <strong>{plural(late, 'late student')}</strong></> : null} will be alerted on WhatsApp and the parent app. Alerts cannot be recalled once sent.</p>
            )}
          </div>
        ),
        confirmLabel: 'Save attendance',
        icon: 'check',
      });
      if (!ok) return;
    }
    save.mutate({ sectionId, date, marks: r.students.map((s) => ({ studentId: s.id, status: marks[s.id]! })) });
  };

  if (sections.isLoading) return <PageSkeleton kpis={0} />;
  if (sections.error) return <ErrorState error={sections.error} onRetry={() => sections.refetch()} />;
  if (!list.length) {
    return (
      <Card>
        <Empty icon="checkSquare" title="No sections to mark"
          sub={can('students.read') ? 'No sections with students were found for the selected campus.' : 'You are not assigned to any section yet. Ask the academic office to add your class assignments.'} />
      </Card>
    );
  }

  const s = summary.data;
  const editable = !!r?.editable && can('attendance.mark');
  const title = r ? `${r.section.label}${r.period?.subject ? ` · ${r.period.subject}` : ''}` : 'Register';
  const sub = r
    ? [r.period ? `Period ${r.period.periodNo} · ${r.period.startsAt}–${r.period.endsAt}` : 'No period timetabled', `Room ${r.period?.room ?? r.section.room ?? '—'}`, plural(r.students.length, 'student')].join(' · ')
    : undefined;

  return (
    <>
      {result && (
        <div className="mb-4">
          <Banner tone="success" icon="check">
            <strong>Attendance saved for {result.section}.</strong>{' '}
            {result.absenceAlerts} absence {result.absenceAlerts === 1 ? 'alert' : 'alerts'} and {result.lateNotices} late {result.lateNotices === 1 ? 'notice' : 'notices'} were queued for parents
            ({plural(result.notificationsQueued, 'parent app notification')}).
            {' '}{result.signalsRaised.length
              ? <>Early Warning raised for review: {result.signalsRaised.map((x) => `${x.code} (${x.reason})`).join('; ')}.</>
              : 'Patterns were checked against Early Warning thresholds — no new signals.'}
          </Banner>
        </div>
      )}
      <div className="grid g-main">
        <Card
          title={title}
          sub={sub}
          flush
          actions={
            <div className="row g-2 wrap">
              <select className="select" aria-label="Section" value={sectionId ?? ''} style={{ width: 'auto', minWidth: 150 }}
                onChange={(e) => setParam('section', e.target.value)}>
                {list.map((x) => (
                  <option key={x.id} value={x.id}>{x.label}{campusParam.campusId ? '' : ` · ${x.campusName}`} — {x.status}</option>
                ))}
              </select>
              <input className="input" type="date" aria-label="Register date" value={date} max={todayStr} style={{ width: 150 }}
                onChange={(e) => setParam('date', e.target.value && e.target.value !== todayStr ? e.target.value : null)} />
            </div>
          }
        >
          {reg.error ? (
            <ErrorState error={reg.error} onRetry={() => reg.refetch()} />
          ) : !r ? (
            <div className="card__body col g-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={36} />)}</div>
          ) : (
            <>
              {!editable && (
                <div style={{ padding: '12px 16px' }}>
                  <Banner tone="neutral" icon="lock">{r.readOnlyReason ?? 'This register is read-only for your role.'}</Banner>
                </div>
              )}
              <div className="toolbar">
                {editable && <Button size="sm" variant="teal" icon="check" onClick={() => setAll('present')}>Mark all present</Button>}
                {editable && <Button size="sm" onClick={() => setAll('reset')} disabled={!dirty}>Reset</Button>}
                <div className="spacer" />
                <span className="row g-3 t-xs t-num" aria-label="Live summary">
                  <span className="row g-1" title="Present"><span className="dot dot--success" />{counts.present}</span>
                  <span className="row g-1" title="Late"><span className="dot dot--warning" />{counts.late}</span>
                  <span className="row g-1" title="Absent"><span className="dot dot--critical" />{counts.absent}</span>
                  <span className="row g-1" title="Leave"><span className="dot dot--info" />{counts.leave}</span>
                  {counts.unmarked > 0 && <Badge tone="neutral">{counts.unmarked} unmarked</Badge>}
                </span>
              </div>
              {r.students.length === 0 ? (
                <Empty icon="users" title="No students in this section" />
              ) : (
                <div>
                  {r.students.map((st) => {
                    const m = marks[st.id] ?? null;
                    return (
                      <div key={st.id} className="row g-3 wrap" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-soft)' }}>
                        <span className="t-micro t-muted t-num none" style={{ width: 22 }}>{st.roll ?? '—'}</span>
                        <span className="grow" style={{ minWidth: 160 }}>
                          <StudentLink id={st.id} name={st.fullName} meta={[
                            st.admissionNo,
                            st.parentNotifiedAt && (st.status === 'absent' || st.status === 'late') ? `parent notified ${fmt.time(st.parentNotifiedAt)}` : null,
                            st.arrivalTime && st.status === 'late' ? `arrived ${st.arrivalTime}` : null,
                          ].filter(Boolean).join(' · ')} />
                        </span>
                        <div className="btn-group none" role="group" aria-label={`Attendance for ${st.fullName}`}>
                          {STATUS_BTN.map((b) => (
                            <button key={b.id} type="button" aria-pressed={m === b.id} disabled={!editable}
                              style={m === b.id ? { background: b.color, color: '#fff' } : undefined}
                              onClick={() => { setMarks((x) => ({ ...x, [st.id]: b.id })); setResult(null); }}>
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="card__foot row between wrap g-3">
                <span className="row g-2 t-xs t-muted">
                  <Icon name="clock" size={14} />
                  {r.lastMarkedBy ? `Last saved by ${r.lastMarkedBy.name} · ${fmt.dateTime(r.lastMarkedBy.at)}` : 'Not marked yet for this date.'}
                  {dirty && <Badge tone="warning">Unsaved changes</Badge>}
                </span>
                {editable && (
                  <span className="row g-2">
                    {counts.unmarked > 0 && <span className="t-xs" style={{ color: 'var(--critical)' }}>Mark every student to save</span>}
                    <Button variant="primary" icon="check" onClick={submit} loading={save.isPending} disabled={counts.unmarked > 0 || r.students.length === 0}>
                      Mark Attendance ({r.students.length})
                    </Button>
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        <div className="col g-4">
          <Card title="What happens on submit">
            <Timeline items={[
              { time: 'Immediately', title: 'Attendance saved', body: 'Recorded against the date, the section and each student profile.', tone: 'teal' },
              { time: '+ seconds', title: 'Absent students identified', body: `${plural(counts.absent, 'student')} marked absent, ${counts.late} late.`, tone: 'critical' },
              { time: '+ 1 minute', title: 'WhatsApp parent alert', body: `${plural(newlyAlerted.length, 'new alert')} will be queued in the parent's preferred channel. Delivery is tracked.`, tone: 'amber' },
              { time: '+ 5 minutes', title: 'Pattern analysed', body: 'Consecutive absences and the attendance threshold are checked.', tone: 'info' },
              { time: 'If threshold met', title: 'Early Warning signal raised', body: 'Sent to the class teacher for review. Never applied to the student automatically.', tone: 'critical' },
              { time: 'After your action', title: 'Recorded in Student 360', body: 'The intervention and its outcome live on the student profile.', tone: 'muted' },
            ]} />
          </Card>
          <Card title="Today across the school" sub="Live figures">
            {summary.error ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : !s ? (
              <div className="col g-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}</div>
            ) : (
              <div className="col g-3">
                <Meter label="Sections marked" value={ratio(s.sectionsMarked, s.sections)} right={`${s.sectionsMarked} of ${s.sections}`} tone="teal" />
                <Meter label="Present" value={ratio(s.present + s.late, s.marked)} right={fmt.n(s.present + s.late)} tone="teal" />
                <Meter label="Absent" value={ratio(s.absent, s.marked)} right={String(s.absent)} tone="critical" />
                <Meter label="Late" value={ratio(s.late, s.marked)} right={String(s.late)} tone="amber" />
                <Meter label="On leave" value={ratio(s.leave, s.marked)} right={String(s.leave)} />
              </div>
            )}
            {can('students.read') && (
              <div className="mt-4"><Button block iconRight="arrowRight" onClick={onAnalytics}>Open attendance analytics</Button></div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
interface Analytics {
  date: string;
  kpis: { attendancePct: number | null; delta: number | null; tenDayAverage: number | null; absent: number; late: number; lateTopRoute: { route: string; n: number } | null; repeatAbsentees: number };
  trend: { labels: string[]; values: number[] };
  byGrade: { labels: string[]; present: number[] };
  lateByTime: { labels: string[]; values: number[] };
  patterns: { label: string; value: number; note: string }[];
}

function AttendanceAnalytics() {
  const { campusParam } = useSchool();
  const { can } = useAuth();
  const q = useApiQuery<Analytics>('/attendance/analytics', campusParam, { refetchInterval: 120_000 });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data!;
  const k = a.kpis;
  const minTrend = a.trend.values.length ? Math.max(0, Math.floor(Math.min(...a.trend.values) / 5) * 5 - 5) : 0;
  const TARGET = 93;
  return (
    <>
      <Grid cols="g-4col">
        <Kpi label="Campus attendance" value={k.attendancePct != null ? `${k.attendancePct}%` : '—'} tone="teal" delta={k.delta}
          foot={k.tenDayAverage != null ? `Against ${k.tenDayAverage}% ten-day average` : 'No earlier days yet'} />
        <Kpi label="Absent today" value={k.absent} tone="critical" foot="Parents alerted when marked" />
        <Kpi label="Late today" value={k.late} tone="amber" foot={k.lateTopRoute ? `${k.lateTopRoute.route} has the most late arrivals` : 'No transport pattern'} />
        <Kpi label="Repeat absentees" value={k.repeatAbsentees} tone="critical" foot="3+ consecutive days" to={can('earlywarning.read') ? '/early-warning' : undefined} />
      </Grid>
      <div className="grid g-2col g-4 mt-4">
        <Card title="Attendance trend" sub="Last ten school days">
          {a.trend.values.length
            ? <Chart svg={charts.line({ labels: a.trend.labels, series: [{ name: 'Attendance', values: a.trend.values, color: 'var(--teal)' }], yMin: minTrend, yMax: 100, unit: '%', height: 220 })} />
            : <Empty icon="activity" title="No attendance recorded yet" />}
        </Card>
        <Card title="Class-wise attendance" sub="Today · below 90% needs a conversation">
          {a.byGrade.labels.length
            ? <Chart svg={charts.bar({ labels: a.byGrade.labels, series: [{ name: 'Present %', values: a.byGrade.present, colors: a.byGrade.present.map((p) => (p < 90 ? 'var(--critical)' : p < TARGET ? 'var(--amber)' : 'var(--teal)')) }], yMax: 100, target: TARGET, targetLabel: 'Target', height: 220 })} />
            : <Empty icon="checkSquare" title="No registers marked today" />}
        </Card>
        <Card title="Late arrivals by time" sub="Recorded arrival times, last seven days">
          {a.lateByTime.labels.length
            ? <Chart svg={charts.bar({ labels: a.lateByTime.labels, series: [{ name: 'Students', values: a.lateByTime.values, color: 'var(--navy)' }], height: 220 })} />
            : <Empty icon="clock" title="No late arrivals this week" />}
        </Card>
        <Card title="Absence patterns" sub="What the pattern check found">
          <Chart svg={charts.hbar({ rows: a.patterns.map((p) => ({ label: p.label, value: p.value, display: `${p.value} · ${p.note}` })), labelW: 180, rowH: 36 })} />
        </Card>
      </div>
    </>
  );
}
