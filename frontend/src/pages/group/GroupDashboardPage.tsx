import { useState } from 'react';
import {
  Badge, Button, Card, Chart, DataTable, Empty, ErrorState, Grid, Icon, Kpi, Legend, Page, PageHead, PageSkeleton, Segment, SelectField, Status,
  StudentLink, charts,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useSchool } from '@/layouts/SchoolContext';
import { fmt } from '@/lib/format';
import { CAMPUS_COLORS, ComparisonCard, comparisonCsv, fmtMetric, type CampusMetrics, type MetricRow } from './shared';

interface Dashboard {
  kpis: {
    campuses: number; students: number; staff: number; staffTarget: number | null; staffingPct: number | null; admissionsYtd: number; admissionsTarget: number | null;
    attendancePct: number | null; attendanceDelta: number | null; feesCollected: number; feesOutstanding: number; collectionPct: number | null;
    nps: number | null; npsDelta: number | null; atRisk: number;
  };
  campuses: CampusMetrics[];
  rows: MetricRow[];
  transfers: { id: string; studentId: string; studentName: string; grade: string | null; fromCampus: string; toCampus: string; status: string }[];
}

export default function GroupDashboardPage() {
  const school = useSchool();
  const q = useApiQuery<Dashboard>('/group/dashboard');
  const [view, setView] = useState<'group' | 'campus'>(school.scope === 'campus' ? 'campus' : 'group');
  const [pick, setPick] = useState<string>('');
  if (q.isLoading) return <Page><PageSkeleton /></Page>;
  if (q.error || !q.data) return <Page><ErrorState error={q.error} onRetry={q.refetch} /></Page>;
  const d = q.data;
  const k = d.kpis;
  const campusId = pick || school.campusId || d.campuses[0]?.id;
  const segment = <Segment items={[{ id: 'group', label: 'Group View' }, { id: 'campus', label: 'Campus View' }]} active={view} onChange={setView} />;

  if (view === 'campus') {
    const c = d.campuses.find((x) => x.id === campusId) ?? d.campuses[0];
    if (!c) return <Page><Empty title="No campuses" /></Page>;
    return (
      <Page>
        <PageHead title={c.name} sub={`${c.place} · established ${c.established ?? '—'} · ${c.curriculum ?? ''}`}
          actions={<>
            {segment}
            <SelectField label="Campus" value={c.id} onChange={setPick} options={d.campuses.map((x) => ({ value: x.id, label: x.shortName }))} style={{ minWidth: 160 }} />
            <Button icon="refresh" onClick={() => school.setCampus(c.id)}>Switch app to {c.shortName}</Button>
          </>} />
        <Grid cols="g-4col">
          {d.rows.map((m) => {
            const val = m.values[c.id];
            const others = d.campuses.filter((x) => x.id !== c.id).map((x) => m.values[x.id]).filter((x): x is number => x != null);
            const avg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;
            const delta = val != null && avg ? Math.round(((val - avg) / avg) * 1000) / 10 : null;
            return <Kpi key={m.key} label={m.label} value={fmtMetric(val, m.format)} tone={delta == null || delta >= 0 ? 'teal' : 'amber'}
              delta={delta} deltaUnit="% vs other campuses" foot={delta == null ? m.hint : undefined} />;
          })}
        </Grid>
        <div className="mt-5"><ComparisonCard campuses={d.campuses} rows={d.rows} /></div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHead title="Group Dashboard" sub="Consolidated position across the Holy Sai group, with each campus visible beside the total."
        actions={<>{segment}<Button icon="download" onClick={() => comparisonCsv(d.campuses, d.rows)}>Board pack (CSV)</Button></>} />
      <Grid cols="g-4col">
        <Kpi label="Students" value={fmt.n(k.students)} foot={`${k.campuses} campuses`} />
        <Kpi label="Staff" value={fmt.n(k.staff)} tone="info" foot={k.staffingPct != null ? `${fmt.pct(k.staffingPct, 1)} of ${fmt.n(k.staffTarget)} positions filled` : 'No staffing target set'} />
        <Kpi label="Admissions YTD" value={fmt.n(k.admissionsYtd)} tone="teal" foot={k.admissionsTarget ? `Group target ${fmt.n(k.admissionsTarget)}` : undefined} to="/admissions" />
        <Kpi label="Group attendance" value={fmt.pct(k.attendancePct, 1)} tone="teal" delta={k.attendanceDelta} deltaUnit=" pts vs prior 30 days" />
        <Kpi label="Fees collected" value={fmt.money(k.feesCollected, { compact: true })} tone="teal" foot={k.collectionPct != null ? `${fmt.pct(k.collectionPct, 1)} of billed` : undefined} />
        <Kpi label="Outstanding" value={fmt.money(k.feesOutstanding, { compact: true })} tone="amber" />
        <Kpi label="Parent NPS" value={k.nps != null ? fmt.n(Math.round(k.nps)) : '—'} tone="teal" delta={k.npsDelta} deltaUnit=" vs last survey" />
        <Kpi label="Students needing attention" value={fmt.n(k.atRisk)} tone="critical" to="/early-warning" foot="At Risk or Developing Risk" />
      </Grid>
      <Card title="Campuses" sub="Click a campus to switch the whole application to it" className="mt-5">
        <div className="grid g-3col g-4">
          {d.campuses.map((c) => (
            <button key={c.id} type="button" className="card card--link" style={{ padding: 18, textAlign: 'left' }} onClick={() => school.setCampus(c.id)}>
              <span className="row between">
                <span className="avatar avatar--teal"><Icon name="building" size={18} /></span>
                {school.scope === 'campus' && school.campusId === c.id && <Badge tone="success">Current</Badge>}
              </span>
              <span className="t-bold" style={{ display: 'block', marginTop: 12 }}>{c.name}</span>
              <span className="t-micro t-muted" style={{ display: 'block' }}>{c.place} · since {c.established ?? '—'}</span>
              <span className="t-xs t-muted" style={{ display: 'block', marginTop: 6 }}>{c.curriculum}</span>
              <span className="row between mt-4">
                <span className="col"><span className="t-micro t-muted">Students</span><span className="t-bold t-num">{fmt.n(c.students)}</span></span>
                <span className="col"><span className="t-micro t-muted">Staff</span><span className="t-bold t-num">{fmt.n(c.staff)}</span></span>
                <span className="col"><span className="t-micro t-muted">Attendance</span><span className="t-bold t-num">{fmt.pct(c.attendancePct, 1)}</span></span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      <div className="mt-4"><ComparisonCard campuses={d.campuses} rows={d.rows} /></div>
      <div className="grid g-2col g-4 mt-4">
        <Card title="Students by campus">
          <Chart svg={charts.donut({
            size: 200, thickness: 30, center: fmt.n(k.students), centerSub: 'students',
            data: d.campuses.map((c, i) => ({ label: c.shortName, value: c.students, color: CAMPUS_COLORS[i % CAMPUS_COLORS.length] })),
          })} />
          <div className="mt-4"><Legend items={d.campuses.map((c, i) => ({ label: `${c.shortName} (${fmt.n(c.students)})`, color: CAMPUS_COLORS[i % CAMPUS_COLORS.length] }))} /></div>
        </Card>
        <Card title="Inter-campus transfers" sub="Movement within the group" flush actions={<Button size="sm" to="/transfers">All transfers</Button>}>
          {!d.transfers.length ? <Empty icon="refresh" title="No transfers" /> : (
            <DataTable compact rows={d.transfers} rowKey={(r) => r.id} columns={[
              { key: 'student', label: 'Student', render: (r) => <StudentLink id={r.studentId} name={r.studentName} meta={r.grade ?? undefined} /> },
              { key: 'from', label: 'From', render: (r) => r.fromCampus },
              { key: 'to', label: 'To', render: (r) => r.toCampus },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            ]} />
          )}
        </Card>
      </div>
    </Page>
  );
}
