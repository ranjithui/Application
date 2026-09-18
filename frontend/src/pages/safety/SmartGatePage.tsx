import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiQuery, usePagedQuery } from '@/hooks/useApi';
import {
  Avatar, Badge, Button, Card, Chart, charts, DataTable, Empty, ErrorState, Grid, Icon, Kpi, Page, PageHead, PageSkeleton, Skeleton, Status,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { GateEventModal, LiveBadge, POLL_MS, severityTone, UnauthorisedModal } from './shared';
import type { FeedItem, GateSummary, Incident, PickupAuth } from './types';

export default function SmartGatePage() {
  const { can } = useAuth();
  const { campusParam } = useSchool();
  const summary = useApiQuery<GateSummary>('/gate/summary', campusParam, { refetchInterval: POLL_MS });
  const feed = useApiQuery<FeedItem[]>('/gate/feed', campusParam, { refetchInterval: POLL_MS });
  const pending = usePagedQuery<PickupAuth>('/pickup/authorisations', { status: 'Pending', pageSize: 4, sort: 'created', dir: 'desc', ...campusParam });
  const incidents = usePagedQuery<Incident>('/incidents', { pageSize: 5, sort: 'date', dir: 'desc', ...campusParam });
  const [modal, setModal] = useState<'gate' | 'unauthorised' | null>(null);
  const manage = can('safety.manage');
  const s = summary.data;

  return (
    <Page>
      <PageHead
        title="Smart Gate"
        sub="Live child safety: who has arrived, who is inside, who has left, and who is authorised to collect them."
        actions={
          <>
            {manage && <Button icon="scan" onClick={() => setModal('gate')}>Record entry / exit</Button>}
            <Button icon="idCard" to="/visitors">Visitor check-in</Button>
            {can(['notifications.broadcast', 'safety.manage']) && <Button variant="danger" icon="megaphone" to="/emergency">Emergency broadcast</Button>}
          </>
        }
      />

      {summary.error ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : summary.isLoading || !s ? <PageSkeleton kpis={4} /> : (
        <>
          <Grid cols="g-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Kpi label="Arrived" value={fmt.n(s.arrived)} tone="teal" foot={`Parents notified automatically · ${s.notArrived} not yet arrived`} to="/gate-log?status=Inside" />
            <Kpi label="Inside campus" value={fmt.n(s.inside)} foot="Live headcount" />
            <Kpi label="Exited" value={fmt.n(s.exited)} tone="amber" foot="Early departures and collections" to="/gate-log?status=Exited" />
            <Kpi label="Visitors on site" value={fmt.n(s.visitorsOnSite)} tone="info"
              foot={s.visitorsExpected ? `${s.visitorsExpected} more expected today` : 'No further visits expected today'} to="/visitors" />
            <Kpi label="Pending pickup" value={fmt.n(s.pendingPickup)} tone={s.pendingPickup ? 'critical' : undefined}
              foot={`Sick bay or held collections · ${s.pendingAuthorisations} to verify`} to="/pickup" />
          </Grid>

          <div className="grid g-main mt-4">
            <Card title="Live activity feed" sub="Every entry, exit and notification, as it happens" actions={<LiveBadge at={s.generatedAt} />} flush>
              <div className="card__body">
                {feed.error ? <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
                  : feed.isLoading ? <div className="col g-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={34} />)}</div>
                  : !feed.data?.length ? <Empty icon="door" title="Nothing yet today" sub="Scans, visitors and bus arrivals appear here as they happen." />
                  : feed.data.map((i) => (
                    <div className="feed__item" key={i.id}>
                      <span className="feed__time">{fmt.time(i.at)}</span>
                      <span className="none" style={{ paddingTop: 1 }}><Icon name={i.icon} size={15} className={i.tone === 'critical' ? 't-critical' : 't-muted'} /></span>
                      <div className="grow">
                        <div className="t-sm">
                          {i.actor && (i.studentId
                            ? <Link to={`/student-360/${i.studentId}`} className="t-bold">{i.actor}</Link>
                            : <strong>{i.actor}</strong>)}{i.actor ? ' ' : ''}{i.text}
                        </div>
                        {i.meta && <div className="t-micro t-muted">{i.meta}</div>}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>

            <div className="col g-4">
              <Card title="Gate status" sub="Main, rear and visitor gates, and the bus bay">
                <div className="col g-3">
                  {s.gates.map((g) => (
                    <div className="row g-3" key={g.gate}>
                      <span className={`dot dot--${g.tone}`} style={{ marginTop: 6 }} />
                      <span className="col grow">
                        <span className="t-sm t-bold">{g.gate}</span>
                        <span className="t-micro t-muted">{g.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Pickup verification" sub={`${s.pendingAuthorisations} authorised ${s.pendingAuthorisations === 1 ? 'person' : 'people'} awaiting verification`} flush
                actions={<Button size="sm" variant="quiet" to="/pickup">Open</Button>}>
                <div className="card__body">
                  {pending.error ? <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
                    : pending.isLoading ? <Skeleton height={60} />
                    : !pending.data?.rows.length ? <Empty icon="key" title="Everyone is verified" sub="New pickup persons added by parents or the office appear here." />
                    : (
                      <div className="col g-2">
                        {pending.data.rows.map((p) => (
                          <Link key={p.id} to={`/pickup?studentId=${p.studentId}`} className="row g-3 card card--tint" style={{ padding: '10px 12px' }}>
                            <Avatar name={p.personName} size="sm" />
                            <span className="col grow" style={{ minWidth: 0 }}>
                              <span className="t-sm t-bold t-clip">{p.personName}</span>
                              <span className="t-micro t-muted t-clip">{p.relation} · {p.method} · for {p.studentName}</span>
                            </span>
                            <Status value={p.status} />
                          </Link>
                        ))}
                      </div>
                    )}
                  {manage && (
                    <div className="mt-4">
                      <Button block variant="danger" icon="alert" onClick={() => setModal('unauthorised')}>Report unauthorised pickup</Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>

          <div className="grid g-2col g-4 mt-4">
            <Card title="Arrivals through the morning" sub="Cumulative first entries, every 15 minutes">
              {s.arrivals.values.some((v) => v > 0)
                ? <Chart svg={charts.line({ labels: s.arrivals.labels, series: [{ name: 'Cumulative arrivals', values: s.arrivals.values, color: 'var(--teal)' }], height: 210 })} />
                : <Empty icon="clock" title="No arrivals yet" sub="The curve fills in as students scan in." />}
            </Card>
            <Card title="Incidents and audit trail" sub="Every safety event is logged and closed with an owner" flush
              actions={<Button size="sm" variant="quiet" to="/safeguarding">All incidents</Button>}>
              {incidents.error ? <ErrorState error={incidents.error} onRetry={() => incidents.refetch()} /> : (
                <DataTable
                  rows={incidents.data?.rows}
                  loading={incidents.isLoading}
                  rowKey={(r) => r.id}
                  compact
                  emptyText="No incidents recorded."
                  columns={[
                    { key: 'code', label: 'Ref', render: (r) => <span className="t-num t-bold">{r.code}</span> },
                    { key: 'type', label: 'Type', render: (r) => r.incidentType },
                    { key: 'summary', label: 'Summary', render: (r) => <span className="row g-1">{r.isConfidential && <Icon name="lock" size={12} />}{r.summary}</span> },
                    { key: 'severity', label: 'Severity', render: (r) => <Badge tone={severityTone(r.severity)}>{r.severity}</Badge> },
                    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
                    { key: 'owner', label: 'Owner', render: (r) => r.ownerName ?? '—' },
                  ]}
                />
              )}
            </Card>
          </div>
        </>
      )}

      {modal === 'gate' && <GateEventModal onClose={() => setModal(null)} />}
      {modal === 'unauthorised' && <UnauthorisedModal onClose={() => setModal(null)} />}
    </Page>
  );
}
