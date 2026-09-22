import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nProvider';
import { useSchool } from '@/layouts/SchoolContext';
import {
  AiNotice, AlertItem, Badge, Button, Card, Chart, charts, Empty, ErrorState, Feed, Funnel, Grid, Kpi, Meter, Page,
  PageSkeleton, Segment,
} from '@/components/ui';
import { fmt } from '@/lib/format';

interface Dashboard {
  scope: 'campus' | 'group';
  generatedAt: string;
  students: { total: number; atRisk: number; developing: number; onTrack: number };
  attendance: {
    today: { present: number; late: number; absent: number; leave: number; marked: number; total: number };
    todayPct: number | null;
    trend: { label: string; date: string; value: number }[];
    byGrade: { grade: string; level: number; present: number }[];
    lateByTime: { label: string; value: number }[];
    weekdayAbsences: { day: string; dow: number; absences: number }[];
    repeatAbsentees: number;
  };
  staff: { total: number; present: number; absent: number; onLeave: number; late: number; teaching: number; nonTeaching: number; teachingPresent: number; nonTeachingPresent: number };
  admissions?: {
    enquiries: number; admitted: number; thisMonth: number; unassigned: number; conversion: number; costPerAdmission: number | null;
    funnel: { label: string; value: number }[]; sources: { label: string; value: number }[]; overdueFollowUps: number;
  };
  finance?: { billed: number; collected: number; outstanding: number; overdue: number; overdueAccounts: number; collectedToday: number; collectionPct: number };
  earlyWarning?: { open: number; awaitingReview: number; inIntervention: number; closedThisTerm: number };
  parentEngagement: { score: number | null; unanswered: number; oldestUnanswered: string | null };
  academic: { byGrade: { grade: string; level: number; average: number }[] };
  approvals: { total: number; expenses: number; leave: number; overtime: number; concessions: number; reimbursements: number; certificates: number; payroll: number };
  tracking?: { total: number; active: number; offline: number; paused: number; disabled: number; atSchool: number; inTransit: number; atHome: number };
  attention: { tone: string; icon: string; title: string; meta: string; route: string; count: number }[];
  activity: { at: string; text: string; module: string; by: string; icon: string }[];
}

type AttTab = 'trend' | 'grade' | 'late' | 'pattern';
const SOURCE_COLORS = ['var(--teal)', 'var(--navy)', 'var(--viz-4)', 'var(--amber)', 'var(--viz-5)', 'var(--viz-7)', 'var(--viz-6)', 'var(--viz-8)'];

export default function CommandCenterPage() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const school = useSchool();
  const navigate = useNavigate();
  const [attTab, setAttTab] = useState<AttTab>('trend');
  const q = useApiQuery<Dashboard>('/dashboard/command-center', { scope: school.scope, campusId: school.campusId }, { refetchInterval: 120_000 });

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const greet = hour < 12 ? t('Good Morning') : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const scopeLabel = school.scope === 'group' ? 'all campuses' : school.campus?.name ?? 'your campus';

  const head = (
    <div className="pagehead">
      <div className="grow">
        <h1 className="display">{greet}, {user?.title?.split('·')[0].trim() || user?.fullName}</h1>
        <p className="lede mt-2">{t("Here's your live school pulse")} — {scopeLabel}, {school.yearLabel}.</p>
      </div>
      <div className="pagehead__actions">
        {q.data && <span className="illustrative"><span className="dot dot--success dot--pulse" />Live · updated {fmt.time(q.data.generatedAt)}</span>}
        {can('prototype.view') && <Button icon="play" to="/day-in-life">Day in the life</Button>}
        {can(['notifications.broadcast', 'safety.manage']) && <Button variant="danger" icon="megaphone" to="/emergency">Emergency broadcast</Button>}
      </div>
    </div>
  );

  if (q.isLoading) return <Page>{head}<PageSkeleton kpis={8} /></Page>;
  if (q.error || !q.data) return <Page>{head}<ErrorState error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const a = d.attendance;
  const presentNow = a.today.present + a.today.late;

  const kpis = [
    <Kpi key="s" label={t('Total Students')} value={fmt.n(d.students.total)} foot={school.scope === 'group' ? 'All campuses' : school.campus?.place} to="/students" />,
    <Kpi key="p" label={t('Present Today')} value={fmt.n(presentNow)} unit={a.todayPct != null ? `· ${fmt.pct(a.todayPct, 1)}` : undefined} tone="teal"
      foot={`${fmt.n(a.today.marked)} of ${fmt.n(a.today.total)} marked`} to="/attendance" spark={a.trend.map((x) => x.value)} sparkColor="var(--teal)" />,
    <Kpi key="a" label={t('Absent Today')} value={fmt.n(a.today.absent)} unit={`· ${a.today.late} late`} tone="critical" foot={`${a.repeatAbsentees} absent 3+ days in a row this month`} to="/attendance" />,
    <Kpi key="st" label={t('Staff Present')} value={`${d.staff.present} / ${d.staff.total}`} tone="info" foot={`${d.staff.absent} absent · ${d.staff.onLeave} on leave`} to={can('hr.read') ? '/staff-attendance' : undefined} />,
    <Kpi key="tt" label={t('Teaching Staff')} value={fmt.n(d.staff.teaching)} tone="teal"
      foot={`${d.staff.teachingPresent} present today`} to={can('hr.read') ? '/teaching-staff' : undefined} />,
    <Kpi key="nt" label={t('Non-Teaching Staff')} value={fmt.n(d.staff.nonTeaching)} tone="amber"
      foot={`${d.staff.nonTeachingPresent} present today`} to={can('hr.read') ? '/non-teaching-staff' : undefined} />,
  ];
  if (d.admissions) {
    kpis.push(
      <Kpi key="ad" label={t('Admissions Pipeline')} value={fmt.n(d.admissions.funnel[1]?.value ?? 0)} unit="qualified" tone="amber"
        foot={`${d.admissions.admitted} admitted · ${d.admissions.thisMonth} enquiries this month`} to="/admissions" />,
    );
  }
  if (d.finance) {
    kpis.push(
      <Kpi key="fc" label={t('Fees Collected')} value={fmt.money(d.finance.collected, { compact: true })} unit={`· ${fmt.pct(d.finance.collectionPct, 1)}`} tone="teal"
        foot={`Of ${fmt.money(d.finance.billed, { compact: true })} billed`} to="/fees" />,
      <Kpi key="fo" label={t('Outstanding Fees')} value={fmt.money(d.finance.outstanding, { compact: true })} tone="critical"
        foot={`${fmt.money(d.finance.overdue, { compact: true })} past due · ${d.finance.overdueAccounts} accounts`} to="/fees" />,
    );
  }
  kpis.push(
    <Kpi key="sr" label={t('Students Requiring Attention')} value={d.students.atRisk} unit={`+ ${d.students.developing} developing`} tone="critical"
      foot={d.earlyWarning ? `${d.earlyWarning.awaitingReview} signals awaiting teacher review` : 'Risk bands from live data'} to={can('earlywarning.read') ? '/early-warning' : '/students?risk=At+Risk'} />,
  );
  if (d.tracking) {
    kpis.push(
      <Kpi key="tr" label="Student Tracking" value={`${d.tracking.active} / ${d.tracking.total}`} unit="live" tone="info"
        foot={`${d.tracking.atSchool} on campus · ${d.tracking.offline} offline`} to="/student-tracking" />,
    );
  }
  kpis.push(
    <Kpi key="pe" label="Parent Engagement" value={d.parentEngagement.score != null ? `${d.parentEngagement.score}` : '—'} unit="/100"
      foot={`${d.parentEngagement.unanswered} queries awaiting reply`} to={can('communication.read') ? '/parent-communication' : undefined} />,
  );
  if (d.approvals.total || kpis.length % 4) {
    kpis.push(
      <Kpi key="ap" label="Pending Approvals" value={d.approvals.total} tone="amber"
        foot={`${d.approvals.leave} leave · ${d.approvals.expenses} expenses · ${d.approvals.certificates} certificates`} to="/my-tasks" />,
    );
  }

  const attTabs: { id: AttTab; label: string }[] = [
    { id: 'trend', label: 'Attendance trend' },
    { id: 'grade', label: 'Class-wise' },
    { id: 'late', label: 'Late arrivals' },
    { id: 'pattern', label: 'Absence patterns' },
  ];
  let attChart = '';
  if (attTab === 'trend' && a.trend.length) {
    const min = Math.max(0, Math.floor(Math.min(...a.trend.map((x) => x.value)) / 5) * 5 - 5);
    attChart = charts.line({ labels: a.trend.map((x) => x.label), series: [{ name: 'Attendance %', values: a.trend.map((x) => x.value), color: 'var(--teal)' }], yMin: min, yMax: 100, unit: '%', height: 232, label: 'Attendance trend over recent school days' });
  } else if (attTab === 'grade' && a.byGrade.length) {
    attChart = charts.bar({
      labels: a.byGrade.map((g) => g.grade.replace('Grade ', 'G')),
      series: [{ name: 'Present %', values: a.byGrade.map((g) => g.present), colors: a.byGrade.map((g) => (g.present < 85 ? 'var(--critical)' : g.present < 93 ? 'var(--amber)' : 'var(--teal)')) }],
      yMax: 100, target: 93, targetLabel: 'Target 93%', height: 232, label: 'Attendance by grade, last 7 days',
    });
  } else if (attTab === 'late' && a.lateByTime.length) {
    attChart = charts.bar({ labels: a.lateByTime.map((x) => x.label), series: [{ name: 'Late arrivals', values: a.lateByTime.map((x) => x.value), color: 'var(--navy)' }], height: 232, label: 'Late arrival times, last 30 days' });
  } else if (attTab === 'pattern' && a.weekdayAbsences.length) {
    attChart = charts.hbar({ rows: a.weekdayAbsences.map((w) => ({ label: w.day.trim(), value: w.absences, display: `${w.absences} absences` })), labelW: 120, rowH: 34, label: 'Absences by weekday, last 60 days' });
  }

  const risk = d.students;
  const adm = d.admissions;

  return (
    <Page>
      {head}
      <Grid cols="g-4col">{kpis}</Grid>

      <Grid cols="g-main mt-5">
        <Card
          title="Attendance analytics"
          sub={`${a.todayPct != null ? fmt.pct(a.todayPct, 1) : '—'} present among marked · ${a.today.late} late · ${a.today.total - a.today.marked} not yet marked`}
          actions={<Segment items={attTabs} active={attTab} onChange={setAttTab} />}
        >
          {attChart ? <Chart svg={attChart} /> : <Empty icon="chart" title="No attendance data yet" sub="Figures appear once attendance is marked." />}
        </Card>
        <Card
          title={t("Today's Attention")}
          sub="Ranked by urgency. Every row opens the screen where it is resolved."
          actions={<Button size="sm" icon="checkSquare" to="/my-tasks">My tasks</Button>}
          flush
          foot={<span>Signals are advisory. Nothing is actioned automatically.</span>}
        >
          {d.attention.length ? (
            <div>
              {d.attention.map((i) => (
                <AlertItem key={i.title} tone={i.tone} icon={i.icon} title={i.title} meta={i.meta} to={i.route} right={<Badge tone={i.tone}>{i.count}</Badge>} />
              ))}
            </div>
          ) : (
            <Empty icon="check" title="All clear" sub="Nothing needs attention right now." />
          )}
        </Card>
      </Grid>

      <Grid cols="g-main mt-5">
        <Card
          title="Student intelligence"
          sub="Cohort standing from attendance, academic trend and participation"
          actions={can('earlywarning.read') ? <Button size="sm" iconRight="arrowRight" to="/early-warning">Open Early Warning</Button> : undefined}
        >
          <div className="row g-5 wrap">
            <div className="none">
              <Chart svg={charts.donut({
                size: 172, thickness: 24, center: fmt.n(risk.onTrack), centerSub: 'On Track',
                data: [
                  { label: 'On Track', value: risk.onTrack, color: 'var(--teal)' },
                  { label: 'Developing Risk', value: risk.developing, color: 'var(--amber)' },
                  { label: 'At Risk', value: risk.atRisk, color: 'var(--critical)' },
                ],
                label: 'Cohort risk distribution',
              })} />
            </div>
            <div className="grow col g-3" style={{ minWidth: 260 }}>
              {([
                ['On Track', risk.onTrack, 'success', 'Attendance and academic trend within expected range', 'On Track'],
                ['Developing Risk', risk.developing, 'warning', 'One indicator slipping — monitored, not labelled', 'Developing Risk'],
                ['At Risk', risk.atRisk, 'critical', 'Two or more indicators declining — teacher review required', 'At Risk'],
              ] as const).map(([label, n, tone, note, filter]) => (
                <button key={label} type="button" className="row g-3 hoverable" style={{ textAlign: 'left', borderRadius: 8, padding: 4 }} onClick={() => navigate(`/students?risk=${encodeURIComponent(filter)}`)}>
                  <span className={`dot dot--${tone}`} style={{ marginTop: 6 }} />
                  <span className="grow">
                    <span className="row between"><span className="t-sm t-bold">{label}</span><span className="t-sm t-bold t-num">{fmt.n(n)}</span></span>
                    <span className="t-micro t-muted" style={{ display: 'block' }}>{note}</span>
                  </span>
                </button>
              ))}
              {d.earlyWarning && (
                <>
                  <div className="divider" style={{ margin: '8px 0' }} />
                  <div className="grid g-2col g-3">
                    <Meter label="Signals awaiting review" value={pctOf(d.earlyWarning.awaitingReview, d.earlyWarning.open)} right={`${d.earlyWarning.awaitingReview} open`} tone="amber" />
                    <Meter label="Intervention active" value={pctOf(d.earlyWarning.inIntervention, d.earlyWarning.open)} right={`${d.earlyWarning.inIntervention} active`} tone="teal" />
                    <Meter label="Repeat absentees" value={pctOf(a.repeatAbsentees, risk.total)} right={`${a.repeatAbsentees} students`} tone="critical" />
                    <Meter label="Closed this term" value={pctOf(d.earlyWarning.closedThisTerm, d.earlyWarning.closedThisTerm + d.earlyWarning.open)} right={`${d.earlyWarning.closedThisTerm} closed`} tone="info" />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mt-4">
            <AiNotice><strong>Students are never auto-labelled.</strong> These bands are decision support. A teacher confirms every signal before it becomes an intervention.</AiNotice>
          </div>
        </Card>
        <Card title="Live activity" sub="Gate, transport and system events" actions={can('safety.read') ? <Button size="sm" to="/smart-gate">Smart Gate</Button> : undefined}>
          {d.activity.length ? (
            <Feed items={d.activity.slice(0, 8).map((x) => ({ time: fmt.time(x.at), text: x.text, meta: `${x.by} · ${x.module}`, icon: x.icon }))} />
          ) : (
            <Empty icon="activity" title="No activity yet today" />
          )}
        </Card>
      </Grid>

      {(adm || d.academic.byGrade.length > 0) && (
        <Grid cols={adm ? 'g-main mt-5' : 'g-2col mt-5'}>
          {adm && (
            <Card
              title="Admissions funnel"
              sub={`${adm.conversion}% enquiry-to-admission${adm.costPerAdmission ? ` · cost per admission ${fmt.money(adm.costPerAdmission)}` : ''}`}
              actions={<Button size="sm" iconRight="arrowRight" to="/admissions">Open CRM</Button>}
            >
              <Funnel rows={adm.funnel} onSelect={() => navigate('/pipeline')} />
              <div className="divider" />
              <div>
                <div className="eyebrow mb-3">Enquiries by source</div>
                {adm.sources.length ? (
                  <Chart svg={charts.hbar({ rows: adm.sources.map((s, i) => ({ label: s.label, value: s.value, color: SOURCE_COLORS[i % SOURCE_COLORS.length] })), labelW: 104, rowH: 27, label: 'Enquiries by source' })} />
                ) : <p className="t-sm t-muted">No enquiries recorded.</p>}
              </div>
            </Card>
          )}
          <Card title="Academic performance" sub="Latest-term average by grade" actions={<Button size="sm" iconRight="arrowRight" to="/academic-performance">Details</Button>}>
            {d.academic.byGrade.length ? (
              <div className="col g-3">
                {d.academic.byGrade.map((g) => (
                  <Meter key={g.grade} label={g.grade} value={g.average} right={`${g.average}/100`} tone={g.average >= 75 ? 'teal' : g.average >= 60 ? undefined : 'critical'} />
                ))}
              </div>
            ) : <Empty icon="trending" title="No results recorded yet" />}
          </Card>
        </Grid>
      )}
    </Page>
  );
}

function pctOf(n: number, of: number) {
  return of ? Math.round((n / of) * 100) : 0;
}
