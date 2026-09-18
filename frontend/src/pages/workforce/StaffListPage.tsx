import { useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useSchool } from '@/layouts/SchoolContext';
import { Card, DataTable, ErrorState, FilterSelect, Grid, Kpi, Page, PageHead, Pagination, SearchInput } from '@/components/ui';
import { fmt } from '@/lib/format';
import { EmpLink, TodayBadge, useEmployeeModal } from './shared';
import type { EmployeeRow, EmployeeType, WorkforceSummary } from './types';

const COPY: Record<EmployeeType, { title: string; sub: string }> = {
  teaching: { title: 'Teaching Staff', sub: 'Teachers, counsellors and academic specialists.' },
  non_teaching: { title: 'Non-Teaching Staff', sub: 'Reception, security, drivers and attendants, housekeeping, lab and library.' },
};

export default function StaffListPage({ type }: { type: EmployeeType }) {
  const { campusParam } = useSchool();
  const list = useListParams({ sort: 'name' }, ['department', 'today']);
  const summary = useApiQuery<WorkforceSummary>('/workforce/summary', { ...campusParam, employeeType: type });
  const q = usePagedQuery<EmployeeRow>('/workforce/employees', { ...list.query, ...campusParam, employeeType: type });
  const [openEmployee, employeeModal] = useEmployeeModal();
  const k = summary.data?.kpis;
  const teaching = type === 'teaching';

  return (
    <Page>
      <PageHead title={COPY[type].title} sub={COPY[type].sub} />
      {summary.error ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : (
        <Grid cols="g-4col">
          <Kpi loading={summary.isLoading} label="Employees" value={fmt.n(k?.total)} />
          <Kpi loading={summary.isLoading} label="Present today" value={fmt.n((k?.present ?? 0) + (k?.late ?? 0) + (k?.halfDay ?? 0))} tone="teal"
            foot={k ? `${k.late} late · ${k.absent} absent` : undefined} />
          <Kpi loading={summary.isLoading} label="On leave" value={fmt.n(k?.leave)} tone="info" to="/leave" />
          {teaching
            ? <Kpi loading={summary.isLoading} label="Average load" value={k?.avgWorkload != null ? `${k.avgWorkload} periods` : '—'} tone="amber" to="/workload" />
            : <Kpi loading={summary.isLoading} label="Overtime hours" value={`${fmt.n(k?.overtimeHours ?? 0)} h`} tone="amber" to="/overtime" />}
        </Grid>
      )}
      <div className="filterbar mt-4">
        <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search name, ID or role" />
        <FilterSelect label="Department" value={list.filters.department} onChange={(v) => list.setFilter('department', v)} options={summary.data?.departments ?? []} />
        <FilterSelect label="Today" value={list.filters.today} onChange={(v) => list.setFilter('today', v)} options={['Present', 'Late', 'Absent', 'On Leave', 'Half Day', 'Not marked']} />
      </div>
      <Card flush>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable
            rows={q.data?.rows} loading={q.isLoading} rowKey={(r) => r.id} sort={list.sort} onSort={list.setSort}
            onRowClick={(r) => openEmployee(r.id)}
            emptyText={list.hasFilters ? 'No employees match these filters.' : `No ${COPY[type].title.toLowerCase()} on this campus.`}
            columns={[
              { key: 'name', label: 'Employee', render: (r) => <EmpLink name={r.fullName} meta={r.designation} onOpen={() => openEmployee(r.id)} /> },
              { key: 'department', label: 'Department' },
              { key: 'shift', label: 'Shift', render: (r) => r.shift ?? '—' },
              { key: 'today', label: 'Today', render: (r) => <TodayBadge status={r.today} /> },
              ...(teaching ? [{ key: 'workload', label: 'Periods', className: 'num', render: (r: EmployeeRow) => r.workload || '—' }] : []),
              { key: 'cpd', label: 'CPD hours', className: 'num', render: (r) => r.cpd },
              { key: 'overtime', label: 'Overtime', className: 'num', render: (r) => `${r.overtime} h` },
            ]}
          />
        )}
        <Pagination meta={q.data?.meta} onPage={list.setPage} onPageSize={list.setPageSize} />
      </Card>
      {employeeModal}
    </Page>
  );
}
