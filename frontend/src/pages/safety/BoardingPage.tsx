import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  Badge, Button, Card, DataTable, Empty, ErrorState, Grid, Kpi, Page, PageHead, Skeleton, StudentLink, useConfirm,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { gradeOf, LiveBadge, POLL_MS, runTone, TRANSPORT_KEYS } from './shared';
import type { BoardingSummary, RouteDetail, RouteStudent } from './types';

function startsIn(hhmm: string | null) {
  if (!hhmm) return undefined;
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const diff = toMin(hhmm) - toMin(now);
  if (diff <= 0) return 'Under way or completed';
  return diff < 60 ? `Starts in ${diff} min` : `Starts in ${Math.floor(diff / 60)} h ${diff % 60} min`;
}

const STATE_TONE: Record<string, string> = { Matched: 'success', 'Not boarded': 'warning', Exception: 'critical', 'In progress': 'info', 'Not running': 'neutral' };

export default function BoardingPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const { campusParam } = useSchool();
  const [sp, setSp] = useSearchParams();
  const manage = can('transport.manage');
  const q = useApiQuery<BoardingSummary>('/transport/boarding/summary', campusParam, { refetchInterval: POLL_MS });
  const routes = q.data?.routes ?? [];
  const selected = routes.find((r) => r.code === sp.get('route')) ?? routes.find((r) => r.state === 'Exception') ?? routes.find((r) => r.runStatus !== 'Maintenance');
  const detail = useApiQuery<RouteDetail>(selected ? `/transport/routes/${selected.id}` : null, undefined, { refetchInterval: POLL_MS });
  const board = useApiMutation<{ studentId: string; routeId: string; eventType: 'boarded' | 'deboarded'; method: string }>('post', '/transport/boarding', {
    invalidate: TRANSPORT_KEYS,
  });

  const confirmEvent = async (s: RouteStudent, eventType: 'boarded' | 'deboarded') => {
    const ok = await confirm({
      title: eventType === 'boarded' ? `Confirm ${s.fullName} boarded?` : `Confirm ${s.fullName} got off?`,
      icon: 'bus', confirmLabel: eventType === 'boarded' ? 'Confirm boarding' : 'Confirm de-boarding',
      body: `${s.fullName}'s parents are notified immediately${eventType === 'boarded' && s.stopName ? ` (stop: ${s.stopName})` : ''}.`,
    });
    if (ok && selected) board.mutate({ studentId: s.id, routeId: selected.id, eventType, method: 'Manual' });
  };

  const s = q.data;
  const d = detail.data?.id === selected?.id ? detail.data : undefined;
  const busy = (id: string) => board.isPending && board.variables?.studentId === id;

  return (
    <Page>
      <PageHead title="Boarding / De-boarding" sub="Every child is accounted for at both ends of every journey." />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <Grid cols="g-4col">
            <Kpi loading={!s} label="Boarded this morning" value={fmt.n(s?.boarded ?? 0)} tone="teal" foot={s ? `of ${s.expected} expected on running routes` : undefined} />
            <Kpi loading={!s} label="De-boarded at campus" value={fmt.n(s?.deboarded ?? 0)} tone={s?.stillOnboard ? 'critical' : 'teal'}
              foot={s ? (s.stillOnboard ? `${s.stillOnboard} still marked on a bus` : 'Reconciled — no discrepancy') : undefined} />
            <Kpi loading={!s} label="Did not board" value={fmt.n(s?.notBoarded ?? 0)} tone="amber"
              foot={s?.maintenanceStudents ? `Plus ${s.maintenanceStudents} on a route out of service` : 'Absent or dropped by parents'} />
            <Kpi loading={!s} label="Afternoon run" value={s?.afternoonRun ?? '—'} tone="info" foot={startsIn(s?.afternoonRun ?? null)} />
          </Grid>

          <div className="mt-4">
            <Card title="Reconciliation by route" sub="Select a route to confirm individual children" flush actions={<LiveBadge />}>
              <DataTable
                rows={s?.routes}
                loading={q.isLoading}
                rowKey={(r) => r.id}
                onRowClick={(r) => setSp({ route: r.code }, { replace: true })}
                rowClassName={(r) => (r.id === selected?.id ? 'is-selected' : undefined)}
                emptyText="No routes for this campus."
                columns={[
                  { key: 'code', label: 'Route', render: (r) => <><span className="t-bold">{r.code}</span> <span className="t-micro t-muted">{r.busNo}</span></> },
                  { key: 'area', label: 'Area' },
                  { key: 'expected', label: 'Expected', className: 'num', render: (r) => <span className="t-num">{r.expected}</span> },
                  { key: 'boarded', label: 'Boarded', className: 'num', render: (r) => <span className="t-num">{r.boarded}</span> },
                  { key: 'deboarded', label: 'De-boarded', className: 'num', render: (r) => <span className="t-num">{r.deboarded}</span> },
                  {
                    key: 'diff', label: 'Difference',
                    render: (r) => r.state === 'Matched' ? <Badge tone="success" icon="check">Matched</Badge>
                      : r.state === 'Exception' ? <Badge tone="critical">{r.stillOnboard} still onboard</Badge>
                      : r.state === 'Not running' ? <Badge tone="neutral">Not running</Badge>
                      : r.notBoarded ? <Badge tone="warning">{r.notBoarded} not boarded</Badge>
                      : <Badge tone={STATE_TONE[r.state] ?? 'neutral'}>{r.state}</Badge>,
                  },
                  { key: 'status', label: 'Status', render: (r) => <Badge tone={runTone(r.runStatus)}>{r.runStatus}</Badge> },
                ]}
              />
            </Card>
          </div>

          {selected && (
            <div className="mt-4">
              <Card title={`${selected.busNo ?? selected.code} · ${selected.name}`} sub={`Attendant ${selected.attendantName ?? '—'} · confirmations notify parents`} flush>
                {detail.error ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : !d ? <div className="card__body"><Skeleton height={160} /></div>
                  : !d.students.length ? <Empty icon="users" title="No students on this route" sub="Assign students from the Routes screen." />
                  : (
                    <DataTable
                      rows={d.students}
                      rowKey={(r) => r.id}
                      columns={[
                        { key: 'student', label: 'Student', render: (r) => <StudentLink id={r.id} name={r.fullName} meta={[r.admissionNo, gradeOf(r.grade, r.section)].filter(Boolean).join(' · ')} /> },
                        { key: 'stop', label: 'Stop', render: (r) => <>{r.stopName ?? '—'}<div className="t-micro t-muted">{r.pickupTime ?? ''}</div></> },
                        { key: 'board', label: 'Boarded', render: (r) => r.boardedAt ? <Badge tone="success" icon="check">{fmt.time(r.boardedAt)}</Badge> : <span className="t-faint">—</span> },
                        { key: 'off', label: 'De-boarded', render: (r) => r.deboardedAt ? <Badge tone="success" icon="check">{fmt.time(r.deboardedAt)}</Badge> : <span className="t-faint">—</span> },
                        {
                          key: 'now', label: 'Now',
                          render: (r) => r.lastEvent === 'boarded' ? <Badge tone="info" dot>On the bus</Badge>
                            : r.lastEvent === 'deboarded' ? <Badge tone="success">Off the bus</Badge>
                            : <Badge tone="warning">Not boarded</Badge>,
                        },
                        ...(manage && selected.runStatus !== 'Maintenance' ? [{
                          key: 'a', label: '', className: 'num',
                          render: (r: RouteStudent) => r.lastEvent === 'boarded'
                            ? <Button size="sm" icon="check" loading={busy(r.id)} onClick={() => confirmEvent(r, 'deboarded')}>De-boarded</Button>
                            : <Button size="sm" variant="primary" icon="check" loading={busy(r.id)} onClick={() => confirmEvent(r, 'boarded')}>Boarded</Button>,
                        }] : []),
                      ]}
                    />
                  )}
              </Card>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
