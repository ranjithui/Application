import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useApiQuery } from '@/hooks/useApi';
import { AlertItem, Badge, Button, Card, Empty, ErrorState, Grid, Icon, Kpi, Meter, Page, PageSkeleton } from '@/components/ui';
import { fmt, todayKey } from '@/lib/format';
import { meterTone, plural, ratio } from './shared';

interface DashClass { id: string; name: string; subject: string; students: number; marked: number; next: string; attendance: string; isClassTeacher: boolean; hasClassToday: boolean }
interface DashPeriod { periodNo: number; startsAt: string; endsAt: string; what: string; where: string; state: 'now' | 'done' | 'upcoming'; free?: boolean; cover?: boolean; sectionId?: string }
interface DashSignal { id: string; code: string; signal: string; signalType: string; stage: number; studentId: string; name: string; admissionNo: string; sectionLabel: string }
interface DashTask { id: string; title: string; module: string; dueOn: string | null; route: string | null; overdue: boolean; priority: string }
interface DashHomework { id: string; title: string; subject: string; sectionLabel: string; dueOn: string; submitted: number; of: number }
interface TeacherDashboard {
  date: string;
  dayName: string;
  lede: string;
  employee: { id: string; fullName: string; designation: string } | null;
  kpis: { classes: number; students: number; toMark: number; toMarkNames: string[]; marksPending: number; marksPendingFoot: string | null; watch: number } | null;
  classes: DashClass[];
  today: DashPeriod[];
  watchlist: DashSignal[];
  watchCount: number;
  tasks: DashTask[];
  homework: DashHomework[];
}

const ATT_TONE: Record<string, string> = { Marked: 'success', Pending: 'warning', 'Not marked': 'critical' };

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

function dueLabel(d: string | null) {
  if (!d) return 'No date';
  if (d === todayKey()) return 'Today';
  return fmt.dateShort(d);
}

export default function TeacherDashboardPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const q = useApiQuery<TeacherDashboard>('/academics/teacher-dashboard', undefined, { refetchInterval: 120_000 });

  if (q.isLoading) return <Page><PageSkeleton /></Page>;
  if (q.error) return <Page><ErrorState error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data!;
  const name = (d.employee?.fullName ?? user?.fullName ?? '').split(' ').slice(0, 2).join(' ');

  const head = (
    <div className="pagehead">
      <div className="grow">
        <h1 className="display">{greeting()}, {name}</h1>
        <p className="lede mt-2">{d.lede}</p>
      </div>
      <div className="pagehead__actions">
        <Button variant="primary" icon="checkSquare" to="/attendance">Mark attendance</Button>
        {can('ai.use') && <Button variant="amber" icon="sparkle" to="/copilot">AI Co-Pilot</Button>}
      </div>
    </div>
  );

  if (!d.employee || !d.kpis) {
    return (
      <Page>
        {head}
        <Card>
          <Empty icon="bookOpen" title="No teaching record linked to your account"
            sub="Classes, timetable and watchlist appear here once your account is linked to a staff record with class assignments. You can still open attendance for any section."
            action={<Button icon="checkSquare" to="/attendance">Open attendance</Button>} />
        </Card>
      </Page>
    );
  }
  const k = d.kpis;

  return (
    <Page>
      {head}
      <Grid cols="g-4col">
        <Kpi label="My classes" value={k.classes} foot={`${plural(k.students, 'student')} in total`} to="/classes" />
        <Kpi label="Attendance to mark" value={k.toMark} tone={k.toMark ? 'critical' : 'teal'} foot={k.toMark ? k.toMarkNames.join(' and ') : 'All registers up to date'} to="/attendance" />
        <Kpi label="Marks pending" value={k.marksPending} tone={k.marksPending ? 'amber' : 'teal'} foot={k.marksPendingFoot ?? 'Nothing waiting'} to="/assessments" />
        <Kpi label="Students to watch" value={k.watch} tone="info" foot="Open Early Warning signals" to={can('earlywarning.read') ? '/early-warning' : undefined} />
      </Grid>

      <div className="grid g-main mt-5">
        <div className="col g-4">
          <Card title="My classes" flush>
            {d.classes.length === 0 ? (
              <Empty icon="users" title="No classes assigned" sub="Class assignments are managed by the academic office." />
            ) : (
              <div className="rule-list">
                {d.classes.map((c) => (
                  <button key={c.id} type="button" className="row g-4 hoverable" style={{ width: '100%', padding: '14px 20px', textAlign: 'left' }}
                    onClick={() => navigate(`/attendance?section=${c.id}`)} aria-label={`Open attendance for ${c.name}`}>
                    <span className="avatar avatar--lg none" style={{ borderRadius: 'var(--r-md)' }}>{c.name.replace('Grade ', 'G')}</span>
                    <span className="col grow">
                      <span className="t-sm t-bold">{c.name} · {c.subject}{c.isClassTeacher ? ' · Class teacher' : ''}</span>
                      <span className="t-micro t-muted">{plural(c.students, 'student')} · next {c.next}</span>
                    </span>
                    <Badge tone={ATT_TONE[c.attendance] ?? 'neutral'} dot>{c.attendance}</Badge>
                    <Icon name="chevronRight" size={15} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Today's timetable" sub={`${d.dayName} ${fmt.date(d.date)}`} flush>
            {d.today.length === 0 ? (
              <Empty icon="calendar" title="No periods today" sub="Your timetable has no lessons on this day." action={<Button size="sm" to="/timetable">Open timetable</Button>} />
            ) : (
              <div className="rule-list">
                {d.today.map((p) => {
                  const now = p.state === 'now';
                  return (
                    <div key={p.periodNo} className={now ? 'row g-4' : 'row g-4 hoverable'}
                      style={{ padding: '12px 20px', background: now ? 'var(--info-tint)' : undefined, opacity: p.state === 'done' ? 0.65 : 1 }}>
                      <span className="t-xs t-num t-muted none" style={{ width: 76 }}>P{p.periodNo} · {p.startsAt}</span>
                      <span className="col grow">
                        <span className={now ? 't-sm t-bold' : 't-sm'}>{p.free ? 'Free — marking' : p.what}</span>
                        <span className="t-micro t-muted">{p.where}{p.cover ? ' · cover lesson' : ''}</span>
                      </span>
                      {now && <Badge tone="info" dot>Now</Badge>}
                      {p.cover && <Badge tone="warning">Cover</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="col g-4">
          <Card title="Students requiring attention" sub="Click any name to open Student 360" flush
            foot="Signals are advisory. You decide whether they need action.">
            {d.watchlist.length === 0 ? (
              <Empty icon="shieldCheck" title="No open signals" sub="None of your students has an open Early Warning signal." />
            ) : (
              <div>
                {d.watchlist.map((w) => (
                  <AlertItem key={w.id} tone={w.signalType === 'attendance' ? 'critical' : w.stage === 0 ? 'warning' : 'caution'} icon="user"
                    title={w.name} meta={`${w.sectionLabel} · ${w.signal}`} onClick={() => navigate(`/student-360/${w.studentId}`)} />
                ))}
                {d.watchCount > d.watchlist.length && can('earlywarning.read') && (
                  <div style={{ padding: '10px 20px' }}><Button size="sm" variant="quiet" iconRight="arrowRight" to="/early-warning">See all {d.watchCount}</Button></div>
                )}
              </div>
            )}
          </Card>

          <Card title="Pending tasks" flush>
            {d.tasks.length === 0 ? (
              <Empty icon="checkSquare" title="Nothing pending" sub="New tasks appear here as they are assigned." />
            ) : (
              <div className="rule-list">
                {d.tasks.map((t) => {
                  const due = dueLabel(t.dueOn);
                  return (
                    <button key={t.id} type="button" className="row g-3 hoverable" style={{ width: '100%', padding: '12px 20px', textAlign: 'left' }}
                      onClick={() => navigate(t.route ?? '/my-tasks')}>
                      <Icon name="checkSquare" size={16} className="t-muted" />
                      <span className="col grow">
                        <span className="t-sm">{t.title}</span>
                        <span className="t-micro t-muted">{t.module}</span>
                      </span>
                      <Badge tone={t.overdue ? 'critical' : due === 'Today' ? 'warning' : 'neutral'}>{t.overdue ? `Overdue · ${due}` : due}</Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Homework status" sub="Open assignments in your classes" flush>
            <div className="card__body">
              {d.homework.length === 0 ? (
                <Empty icon="edit" title="No open homework" action={can('academics.manage') ? <Button size="sm" icon="plus" to="/homework">Set homework</Button> : undefined} />
              ) : d.homework.map((h) => (
                <div className="mb-4" key={h.id}>
                  <Meter label={`${h.sectionLabel} ${h.subject} — due ${fmt.dateShort(h.dueOn)}`} value={Math.round(ratio(h.submitted, h.of))}
                    right={`${h.submitted}/${h.of}`} tone={meterTone(ratio(h.submitted, h.of))} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
