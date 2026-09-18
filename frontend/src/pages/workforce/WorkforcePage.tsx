import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useSchool } from '@/layouts/SchoolContext';
import {
  Button, Card, Chart, DataTable, ErrorState, FilterSelect, Flow, Grid, Kpi, Legend, Meter, Page, PageHead, Pagination, SearchInput, charts,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { SERIES } from '@/lib/tones';
import { EmpLink, EmployeeFormModal, TodayBadge, TypeBadge, monthLabel, useEmployeeModal } from './shared';
import type { EmployeeRow, WorkforceSummary } from './types';

const CATEGORY_COLORS: Record<string, string> = {
  Teachers: 'var(--navy)', Leadership: 'var(--viz-2)', 'Reception & Admin': 'var(--viz-4)', Security: 'var(--viz-5)',
  'Drivers & Attendants': 'var(--amber)', Housekeeping: 'var(--viz-7)', 'Lab Staff': 'var(--teal)', 'Library Staff': 'var(--viz-8)',
};

export default function WorkforcePage() {
  const { can } = useAuth();
  const { campusParam } = useSchool();
  const list = useListParams({ sort: 'name' }, ['employeeType', 'department', 'today']);
  const summary = useApiQuery<WorkforceSummary>('/workforce/summary', campusParam);
  const q = usePagedQuery<EmployeeRow>('/workforce/employees', { ...list.query, ...campusParam });
  const [openEmployee, employeeModal] = useEmployeeModal();
  const [adding, setAdding] = useState(false);
  const k = summary.data?.kpis;
  const j = summary.data?.journey;
  const loading = summary.isLoading;
  const cats = (summary.data?.categories ?? []).map((c, i) => ({ ...c, color: CATEGORY_COLORS[c.label] ?? SERIES[i % SERIES.length] }));

  return (
    <Page>
      <PageHead
        title="Workforce 360"
        sub="One ecosystem for teaching and non-teaching staff — reception, security, drivers, housekeeping, lab and library included."
        actions={<>
          {can('hr.manage') && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add employee</Button>}
          {can('payroll.read') && <Button icon="wallet" to="/payroll">Payroll</Button>}
        </>}
      />
      {summary.error ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : (
        <>
          <Grid cols="g-4col">
            <Kpi loading={loading} label="Total employees" value={fmt.n(k?.total)} foot={k && `${k.teaching} teaching · ${k.nonTeaching} non-teaching`} />
            <Kpi loading={loading} label="Present" value={fmt.n((k?.present ?? 0) + (k?.halfDay ?? 0))} unit={k?.total ? fmt.pct(((k.present + k.halfDay) / k.total) * 100) : undefined} tone="teal"
              foot={k?.notMarked ? `${k.notMarked} not marked yet` : undefined} to="/staff-attendance" />
            <Kpi loading={loading} label="Absent" value={fmt.n(k?.absent)} tone="critical"
              foot={k ? (k.uncoveredToday ? `${k.uncoveredToday} post${k.uncoveredToday === 1 ? '' : 's'} uncovered` : 'All posts covered') : undefined} to="/shifts" />
            <Kpi loading={loading} label="On leave" value={fmt.n(k?.leave)} tone="info"
              foot={k ? `${k.openLeave} request${k.openLeave === 1 ? '' : 's'} awaiting approval` : undefined} to="/leave" />
            <Kpi loading={loading} label="Late" value={fmt.n(k?.late)} tone="amber" to="/staff-attendance" />
            <Kpi loading={loading} label="Overtime hours" value={fmt.n(k?.overtimeHours)} unit="this month" tone="amber" to="/overtime"
              foot={k ? `${k.overtimePending} h pending approval` : undefined} />
            <Kpi loading={loading} label="Payroll inputs pending" value={fmt.n(k?.payrollPending)} tone="critical" to={can('payroll.read') ? '/payroll' : '/leave'} />
            <Kpi loading={loading} label="CPD hours logged" value={fmt.n(k?.cpdHours)} tone="teal" to="/cpd" />
          </Grid>

          <div className="grid g-main mt-5">
            <Card title="Employee journey" sub="One record from recruitment through to the payslip">
              {j ? (
                <Flow steps={[
                  { label: 'Recruitment', meta: `${j.joinedThisYear} joined this year`, state: 'done' },
                  { label: 'Employee profile', meta: `${fmt.n(j.active)} active`, state: 'done' },
                  { label: 'Attendance', meta: 'Daily, by shift', state: 'done' },
                  { label: 'Leave', meta: `${j.openLeave} request${j.openLeave === 1 ? '' : 's'} open`, state: 'done' },
                  { label: 'Overtime', meta: `${fmt.n(j.overtimeHours)} hours`, state: 'done' },
                  { label: 'Approval', meta: `${j.pendingApprovals} pending`, state: j.pendingApprovals ? 'active' : 'done' },
                  { label: 'Payroll', meta: j.currentRun ? `${monthLabel(j.currentRun.payMonth).split(' ')[0]} run · ${j.currentRun.status}` : 'No run yet',
                    state: j.currentRun && ['Released', 'Paid'].includes(j.currentRun.status) ? 'done' : j.pendingApprovals ? undefined : 'active' },
                  { label: 'Payslip', meta: 'Released to the staff app', state: j.currentRun && ['Released', 'Paid'].includes(j.currentRun.status) ? 'done' : undefined },
                ]} />
              ) : <span className="skeleton" style={{ display: 'block', height: 60 }} />}
            </Card>
            <Card title="Workforce composition">
              {cats.length ? (
                <>
                  <Chart svg={charts.donut({ size: 186, thickness: 26, center: String(k?.total ?? 0), centerSub: 'employees', data: cats })} />
                  <div className="mt-4"><Legend items={cats.map((c) => ({ label: `${c.label} (${c.value})`, color: c.color }))} /></div>
                </>
              ) : <span className="skeleton" style={{ display: 'block', height: 186 }} />}
            </Card>
          </div>
        </>
      )}

      <div className="filterbar mt-5">
        <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search name, ID or role" />
        <FilterSelect label="Category" value={list.filters.employeeType} onChange={(v) => list.setFilter('employeeType', v)}
          options={[{ value: 'teaching', label: 'Teaching' }, { value: 'non_teaching', label: 'Non-Teaching' }]} />
        <FilterSelect label="Department" value={list.filters.department} onChange={(v) => list.setFilter('department', v)} options={summary.data?.departments ?? []} />
        <FilterSelect label="Today" value={list.filters.today} onChange={(v) => list.setFilter('today', v)} options={['Present', 'Late', 'Absent', 'On Leave', 'Half Day', 'Not marked']} />
        {list.hasFilters && <Button size="sm" variant="quiet" onClick={list.clear}>Clear</Button>}
        <div className="spacer" />
        <span className="t-sm t-muted t-num">{fmt.n(q.data?.meta.total ?? 0)} employees</span>
      </div>
      <Card flush>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable
            rows={q.data?.rows} loading={q.isLoading} rowKey={(r) => r.id} sort={list.sort} onSort={list.setSort}
            onRowClick={(r) => openEmployee(r.id)}
            emptyText={list.hasFilters ? 'No employees match these filters.' : 'No employees on this campus yet.'}
            columns={[
              { key: 'name', label: 'Employee', render: (r) => <EmpLink name={r.fullName} meta={r.designation} onOpen={() => openEmployee(r.id)} /> },
              { key: 'code', label: 'ID' },
              { key: 'category', label: 'Category', render: (r) => <TypeBadge type={r.employeeType} /> },
              { key: 'department', label: 'Department' },
              { key: 'shift', label: 'Shift', render: (r) => <span className="t-xs t-muted">{r.shift ?? '—'}</span> },
              { key: 'today', label: 'Today', render: (r) => <TodayBadge status={r.today} /> },
              { key: 'leaveBalance', label: 'Leave', className: 'num', render: (r) => <span className="t-num">{r.leaveBalance} d</span> },
              { key: 'overtime', label: 'OT', className: 'num', render: (r) => (r.overtime ? <span className="t-num t-warning">{r.overtime} h</span> : <span className="t-faint">—</span>) },
              { key: 'workload', label: 'Workload', render: (r) => (r.workload
                ? <Meter label="" value={(r.workload / 30) * 100} right={`${r.workload} periods`} tone={r.workload > 27 ? 'critical' : 'teal'} />
                : <span className="t-faint">n/a</span>) },
            ]}
          />
        )}
        <Pagination meta={q.data?.meta} onPage={list.setPage} onPageSize={list.setPageSize} />
      </Card>
      {employeeModal}
      {adding && <EmployeeFormModal onClose={() => setAdding(false)} />}
    </Page>
  );
}
