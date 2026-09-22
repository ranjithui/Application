import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useLookups } from '@/hooks/useLookups';
import {
  Badge, Banner, Button, Card, DataTable, ErrorState, FilterSelect, Grid, Icon, Kpi, Page, PageHead, Pagination, SearchInput,
  Segment, Skeleton, StudentLink,
} from '@/components/ui';
import { StudentMap } from '@/components/map/StudentMap';
import { TrackingPanel, TrackingStatusPill } from '@/components/tracking/TrackingPanel';
import { GpsStatusBadge } from '@/components/tracking/devices';
import type { CurrentLocation, TrackingMapData } from '@/api/types';
import { fmt } from '@/lib/format';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Tracking active' },
  { value: 'offline', label: 'Offline / no update' },
  { value: 'paused', label: 'Paused' },
  { value: 'disabled', label: 'Disabled' },
];
const LOCATION_OPTIONS = [
  { value: 'at_school', label: 'At school' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'at_home', label: 'At home' },
  { value: 'on_trip', label: 'On a school trip' },
];

export default function StudentTrackingPage() {
  const { id } = useParams();
  if (id) return <TrackingDetail id={id} />;
  return <TrackingOverview />;
}

function TrackingOverview() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { campusParam, scope } = useSchool();
  const { classOptions, sectionOptions } = useLookups();
  const list = useListParams({ sort: 'name', pageSize: 25 }, ['classId', 'sectionId', 'status', 'locationStatus']);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'split' | 'map' | 'list'>('split');

  const filters = {
    ...campusParam,
    q: list.q || undefined,
    classId: list.filters.classId || undefined,
    sectionId: list.filters.sectionId || undefined,
    status: list.filters.status || undefined,
    locationStatus: list.filters.locationStatus || undefined,
  };
  const map = useApiQuery<TrackingMapData>('/tracking/map', filters, { refetchInterval: 60_000 });
  const rows = usePagedQuery<CurrentLocation>('/tracking/students', { ...list.query, ...campusParam }, { refetchInterval: 60_000 });
  const s = map.data?.summary;

  const campuses = useMemo(() => (map.data?.campuses ?? []).map((c) => ({ ...c })), [map.data]);

  return (
    <Page>
      <PageHead
        title="Student Tracking"
        sub="Live GPS location of students, with history. Every view of a student's location is recorded in the audit trail."
        crumbs={[{ label: 'Safety & Transport' }, { label: 'Student Tracking' }]}
        actions={
          <>
            {map.data && <span className="illustrative"><span className="dot dot--success dot--pulse" />Refreshed {fmt.time(map.data.generatedAt)}</span>}
            <Segment items={[{ id: 'split', label: 'Map + list' }, { id: 'map', label: 'Map' }, { id: 'list', label: 'List' }]} active={view} onChange={setView} />
            <Button icon="refresh" onClick={() => { map.refetch(); rows.refetch(); }} loading={map.isFetching}>Refresh</Button>
            {(can('tracking.read_all') || can('tracking.manage')) && <Button icon="navigation" to="/gps-devices">GPS Devices</Button>}
          </>
        }
      />
      <div className="mb-4">
        <Banner tone="warning" icon="info">
          <strong>Sample data.</strong> Coordinates in this environment are generated for development and demonstration; they are not real children's locations.
        </Banner>
      </div>

      <Grid cols="g-4col" className="mb-4">
        <Kpi label="Students tracked" value={s ? `${s.active} / ${s.total}` : '—'} unit="live" tone="teal" loading={map.isLoading}
          foot={s ? `${s.paused} paused · ${s.disabled} disabled` : undefined} onClick={() => list.setFilter('status', 'active')} />
        <Kpi label="On campus" value={s?.atSchool ?? '—'} tone="info" loading={map.isLoading} onClick={() => list.setFilter('locationStatus', 'at_school')} />
        <Kpi label="In transit" value={s?.inTransit ?? '—'} tone="amber" loading={map.isLoading} foot={s ? `${s.atHome} at home` : undefined} onClick={() => list.setFilter('locationStatus', 'in_transit')} />
        <Kpi label="Offline / no update" value={s?.offline ?? '—'} tone="critical" loading={map.isLoading} foot={map.data ? `No update for ${map.data.staleAfterMinutes}+ min` : undefined} onClick={() => list.setFilter('status', 'offline')} />
      </Grid>

      <div className="filterbar">
        <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search student name or ID" />
        <FilterSelect label="Class" value={list.filters.classId} onChange={(v) => { list.setFilter('classId', v); list.setFilter('sectionId', ''); }}
          options={classOptions(scope === 'group' ? undefined : campusParam.campusId)} />
        <FilterSelect label="Section" value={list.filters.sectionId} onChange={(v) => list.setFilter('sectionId', v)} options={sectionOptions(list.filters.classId)} />
        <FilterSelect label="Tracking" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} options={STATUS_OPTIONS} />
        <FilterSelect label="Location" value={list.filters.locationStatus} onChange={(v) => list.setFilter('locationStatus', v)} options={LOCATION_OPTIONS} />
        {list.hasFilters && <Button size="sm" variant="quiet" onClick={list.clear}>Clear filters</Button>}
      </div>

      <div className={view === 'split' ? 'grid g-main' : 'col g-4'} style={{ alignItems: 'start' }}>
        {view !== 'list' && (
          <Card
            title="Map"
            sub={map.data ? `${map.data.markers.length} students with a recorded location` : 'Loading…'}
            actions={selected ? <Button size="sm" iconRight="arrowRight" to={`/student-tracking/${selected}`}>Open tracking detail</Button> : undefined}
          >
            {map.error ? <ErrorState error={map.error} onRetry={() => map.refetch()} /> : map.isLoading ? <Skeleton height={560} /> : (
              <StudentMap
                height="tall"
                students={map.data!.markers}
                campuses={campuses}
                selectedId={selected}
                onSelect={setSelected}
                onOpenProfile={(sid) => navigate(`/student-360/${sid}?tab=tracking`)}
                emptyMessage="No students match the current filters."
              />
            )}
          </Card>
        )}
        {view !== 'map' && (
          <Card title="Student list" sub={rows.data ? `${rows.data.meta.total} students` : undefined} flush>
            {rows.error ? <ErrorState error={rows.error} onRetry={() => rows.refetch()} /> : (
              <DataTable
                rows={rows.data?.rows}
                loading={rows.isLoading}
                rowKey={(r) => r.studentId}
                sort={list.sort}
                onSort={list.setSort}
                compact={view === 'split'}
                onRowClick={(r) => (view === 'split' && r.latitude != null ? setSelected(r.studentId) : navigate(`/student-tracking/${r.studentId}`))}
                rowClassName={(r) => (r.studentId === selected ? 'is-selected' : undefined)}
                emptyText="No students match the current filters."
                columns={[
                  { key: 'name', label: 'Student', render: (r) => <StudentLink id={r.studentId} name={r.fullName} meta={r.admissionNo} /> },
                  { key: 'grade', label: 'Class', render: (r) => `${r.grade ?? '—'}${r.section ?? ''}` },
                  { key: 'status', label: 'Status', render: (r) => <TrackingStatusPill status={r.displayStatus} /> },
                  ...(view === 'list' ? [
                    { key: 'device', label: 'Device', sortable: false, render: (r: CurrentLocation) => (r.deviceCode ? <span className="col g-1"><span className="coord t-xs t-bold">{r.deviceCode}</span><GpsStatusBadge status={r.gpsStatus} seenAt={r.deviceLastSeenAt} /></span> : <span className="t-faint">No device</span>) },
                    { key: 'location', label: 'Location', sortable: false, render: (r: CurrentLocation) => (r.latitude != null ? <span>{r.placeLabel ?? r.locationStatusLabel}<div className="coord t-micro">{fmt.coord(r.latitude)}, {fmt.coord(r.longitude)}</div></span> : '—') },
                  ] : []),
                  { key: 'updated', label: 'Last Updated', render: (r) => (r.recordedAt ? <span title={fmt.dateTime(r.recordedAt)}>{fmt.relative(r.recordedAt)}</span> : '—') },
                  {
                    key: 'action', label: 'Action', sortable: false, className: 'num', render: (r) => (
                      <div className="row g-2" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" icon="mapPin" to={`/student-tracking/${r.studentId}`} onClick={(e) => e.stopPropagation()}>Track</Button>
                        {view === 'list' && <Button size="sm" to={`/student-360/${r.studentId}`} onClick={(e) => e.stopPropagation()}>Student 360</Button>}
                      </div>
                    ),
                  },
                ]}
              />
            )}
            <Pagination meta={rows.data?.meta} onPage={list.setPage} onPageSize={view === 'list' ? list.setPageSize : undefined} />
          </Card>
        )}
      </div>
      {!can('tracking.history') && (
        <p className="t-xs t-muted mt-4"><Icon name="lock" size={12} /> Location history is available to authorised staff only.</p>
      )}
    </Page>
  );
}

function TrackingDetail({ id }: { id: string }) {
  const { can } = useAuth();
  const loc = useApiQuery<CurrentLocation>(`/students/${id}/location`);
  return (
    <Page>
      <PageHead
        title={loc.data ? `Tracking — ${loc.data.fullName}` : 'Student Tracking'}
        sub={loc.data ? `${loc.data.admissionNo} · ${loc.data.grade}${loc.data.section} · ${loc.data.campusName}` : undefined}
        crumbs={[{ label: 'Student Tracking', to: '/student-tracking' }, { label: loc.data?.fullName ?? 'Student' }]}
        actions={
          <>
            {loc.data && <Badge tone={loc.data.trackingEnabled ? 'success' : 'neutral'}>{loc.data.trackingEnabled ? 'Consent on file' : 'Tracking disabled'}</Badge>}
            <Button icon="user" to={`/student-360/${id}`}>Open Student 360</Button>
          </>
        }
      />
      <TrackingPanel
        locationPath={`/students/${id}/location`}
        historyPath={can('tracking.history') ? `/students/${id}/location/history` : undefined}
      />
    </Page>
  );
}
