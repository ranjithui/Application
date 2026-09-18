import { useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useSchool } from '@/layouts/SchoolContext';
import {
  Badge, Card, Chart, charts, DataTable, Empty, ErrorState, FilterSelect, Grid, Kpi, Legend, Page, PageHead, Pagination, Person, SearchInput, Skeleton,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { LeadProfileHost } from './LeadProfile';
import { SOURCE_COLOR, SourceBadge, stageTone, useLeadParam } from './shared';
import { SOURCES, type Lead, type Named } from './types';

interface Summary {
  thisMonth: number; monthDelta: number | null; aiAnswered: number; aiAnsweredPct: number; medianReplySeconds: number | null;
  needingHuman: number; unassigned: number; duplicates: number; channels: Named[];
}

export default function EnquiriesPage() {
  const { campusParam } = useSchool();
  const { openLead } = useLeadParam();
  const s = useApiQuery<Summary>('/enquiries/summary', campusParam);
  const list = useListParams({ sort: 'created', dir: 'desc', pageSize: 10 }, ['source']);
  const q = usePagedQuery<Lead>('/enquiries', { ...list.query, ...campusParam });
  const d = s.data;
  const reply = d?.medianReplySeconds;

  return (
    <Page>
      <PageHead title="Enquiries" sub="Raw capture across every channel, before qualification." />
      {s.error ? <ErrorState error={s.error} onRetry={() => s.refetch()} /> : (
        <Grid cols="g-4col">
          <Kpi label="Enquiries this month" value={d?.thisMonth ?? '—'} delta={d?.monthDelta} loading={s.isLoading} foot="vs the same days last month" />
          <Kpi label="Answered by WhatsApp AI" value={d?.aiAnswered ?? '—'} unit={d ? `${d.aiAnsweredPct}%` : undefined} tone="teal" loading={s.isLoading}
            foot={reply != null ? `Median first reply ${reply < 90 ? `${reply} seconds` : `${Math.round(reply / 60)} min`}` : 'No automated replies yet'} />
          <Kpi label="Needing a human" value={d?.needingHuman ?? '—'} tone="amber" loading={s.isLoading}
            foot={d ? `Escalated to a counsellor · ${d.unassigned} unassigned` : undefined} />
          <Kpi label="Duplicate enquiries" value={d?.duplicates ?? '—'} tone="info" loading={s.isLoading} foot="Same parent, multiple channels" />
        </Grid>
      )}
      <div className="grid g-main mt-4">
        <Card title="Channel mix this month">
          {s.isLoading ? <Skeleton height={200} /> : d && d.thisMonth ? (
            <>
              <div className="row center">
                <Chart svg={charts.donut({
                  size: 200, thickness: 28, center: String(d.thisMonth), centerSub: 'enquiries', label: 'Channel mix this month',
                  data: d.channels.map((c) => ({ label: c.label, value: c.value, color: SOURCE_COLOR[c.label] })),
                })} />
              </div>
              <div className="mt-4"><Legend items={d.channels.map((c) => ({ label: `${c.label} (${c.value})`, color: SOURCE_COLOR[c.label] }))} /></div>
            </>
          ) : <Empty icon="pieChart" title="No enquiries this month yet" />}
        </Card>
        <Card title="Latest enquiries" flush actions={
          <FilterSelect label="Channel" value={list.filters.source} onChange={(x) => list.setFilter('source', x)} options={[...SOURCES]} />
        }>
          <div className="toolbar"><SearchInput value={list.q} onSearch={list.setQ} placeholder="Search student, parent or reference" /></div>
          {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
            <DataTable
              rows={q.data?.rows}
              loading={q.isLoading || q.isPlaceholderData}
              rowKey={(r) => r.id}
              sort={list.sort}
              onSort={list.setSort}
              onRowClick={(r) => openLead(r.code)}
              emptyText="No enquiries match."
              columns={[
                { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} meta={`${r.grade} · ${r.parentName}`} /> },
                { key: 'source', label: 'Channel', render: (r) => <SourceBadge source={r.source} /> },
                { key: 'created', label: 'Received', render: (r) => <span className="t-xs">{fmt.relative(r.createdAt)}</span> },
                { key: 'stage', label: 'Stage', render: (r) => <Badge tone={stageTone(r.stage)}>{r.stage}</Badge> },
              ]}
            />
          )}
          <Pagination meta={q.data?.meta} onPage={list.setPage} />
        </Card>
      </div>
      <LeadProfileHost />
    </Page>
  );
}
