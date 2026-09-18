import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  Badge, Banner, Button, Card, Checkbox, DataTable, Empty, ErrorState, Icon, Page, PageHead, PageSkeleton, SelectField,
  Skeleton, StudentLink, TextArea, TextField, Timeline,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { BusFleetMap } from './BusMap';
import { FormModal, gradeOf, LiveBadge, POLL_MS, runTone, TimeCell, TRANSPORT_KEYS, useFieldErrors } from './shared';
import { RUN_STATUSES, type RouteDetail, type RouteRow, type RoutesResponse } from './types';

const busLabel = (r: Pick<RouteRow, 'busNo' | 'code'>) => r.busNo ?? r.code;

export default function BusTrackingPage() {
  const { can } = useAuth();
  const { campusParam } = useSchool();
  const [sp, setSp] = useSearchParams();
  const manage = can('transport.manage');
  const list = useApiQuery<RoutesResponse>('/transport/routes', campusParam, { refetchInterval: POLL_MS });
  const routes = list.data?.routes ?? [];
  const code = sp.get('route');
  const selected = routes.find((r) => r.code === code) ?? routes.find((r) => r.alerts.some((a) => a.tone === 'critical')) ?? routes[0];
  const select = (id: string) => {
    const r = routes.find((x) => x.id === id);
    if (r) setSp({ route: r.code }, { replace: true });
  };
  const detail = useApiQuery<RouteDetail>(selected ? `/transport/routes/${selected.id}` : null, undefined, { refetchInterval: POLL_MS });
  const [modal, setModal] = useState<'status' | 'notify' | null>(null);

  const d = detail.data?.id === selected?.id ? detail.data : undefined;
  const totalStudents = routes.reduce((a, r) => a + r.students, 0);

  return (
    <Page>
      <PageHead
        title="Bus Tracking"
        sub="Live location, ETA, onboard count and deviation alerts. Parents see the same position for their own child's bus."
        actions={
          <>
            <Button icon="route" to="/routes">Route planner</Button>
            {manage && selected && <Button variant="primary" icon="megaphone" onClick={() => setModal('notify')}>Notify route parents</Button>}
          </>
        }
      />
      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.isLoading ? <PageSkeleton kpis={0} /> : !routes.length ? (
        <Card><Empty icon="bus" title="No routes for this campus" sub="Add a route in the route planner to start tracking buses." action={<Button to="/routes" icon="route">Open route planner</Button>} /></Card>
      ) : (
        <div className="grid g-side">
          <Card title="Routes" sub={`${routes.length} buses · ${totalStudents} students`} flush actions={<LiveBadge at={list.data?.generatedAt} />}>
            <div>
              {routes.map((x) => {
                const tone = x.alerts.some((a) => a.tone === 'critical') ? 'critical' : runTone(x.runStatus);
                const itemTone = tone === 'neutral' ? 'info' : tone;
                return (
                  <button key={x.id} type="button" className={`alert-item alert-item--${itemTone}`} onClick={() => select(x.id)}
                    aria-pressed={x.id === selected?.id} style={x.id === selected?.id ? { background: 'var(--surface-alt)' } : undefined}>
                    <span className={`alert-item__ico alert-item__ico--${itemTone}`}><Icon name="bus" size={16} /></span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="alert-item__title" style={{ display: 'block' }}>{busLabel(x)} · {x.area}</span>
                      <span className="alert-item__meta" style={{ display: 'block' }}>
                        {x.onboardNow || x.boardedToday}/{x.students} {x.onboardNow ? 'onboard' : 'boarded'} · {x.eta ?? '—'}
                        {x.alerts.length ? ` · ${x.alerts[0].message}` : ''}
                      </span>
                    </span>
                    <Badge tone={runTone(x.runStatus)}>{x.runStatus}</Badge>
                  </button>
                );
              })}
            </div>
          </Card>

          {selected && (
            <div className="col g-4">
              <Card
                title={`${busLabel(selected)}${selected.registrationNo ? ` · ${selected.registrationNo}` : ''}`}
                sub={`${selected.name} · ${selected.area} · ${selected.stops} stops · driver ${selected.driverName ?? 'unassigned'} · attendant ${selected.attendantName ?? 'none'}`}
                actions={
                  <>
                    <Badge tone={runTone(selected.runStatus)} dot>{selected.runStatus}</Badge>
                    {manage && <Button size="sm" icon="edit" onClick={() => setModal('status')}>Update status</Button>}
                  </>
                }
              >
                <div style={{ position: 'relative' }}>
                  <BusFleetMap routes={routes} campuses={list.data!.campuses} selectedId={selected.id} onSelect={select}
                    trail={d?.trail ?? []} stops={d?.stopList} />
                  {selected.alerts.filter((a) => a.type !== 'delay').map((a) => (
                    <div key={a.type} style={{ position: 'absolute', left: 16, top: 16, zIndex: 600 }}>
                      <Badge tone={a.tone} dot lg>{a.message}</Badge>
                    </div>
                  ))}
                </div>
                <div className="grid g-4col g-3 mt-4">
                  <Stat label="Onboard" value={`${selected.onboardNow || selected.boardedToday}/${selected.students}`} />
                  <Stat label="ETA" value={selected.eta ?? '—'} />
                  <Stat label="Stops done" value={`${selected.stopsDone}/${selected.stops}`} />
                  <Stat label="Delay" value={selected.delayMinutes ? `+${selected.delayMinutes} min` : 'On time'} critical={selected.delayMinutes > 0} />
                </div>
                {selected.location && (
                  <p className="t-micro t-muted mt-2">
                    Last GPS {fmt.relative(selected.location.recordedAt)}{selected.location.speedKmph != null ? ` · ${selected.location.speedKmph} km/h` : ''} · <span className="coord">{fmt.coord(selected.location.latitude)}, {fmt.coord(selected.location.longitude)}</span>
                  </p>
                )}
              </Card>

              <div className="grid g-2col g-4">
                <Card title="Stop sequence" sub="Morning run" flush>
                  <div className="card__body">
                    {detail.error ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
                      : !d ? <Skeleton height={160} />
                      : !d.stopList.length ? <Empty icon="mapPin" title="No stops yet" sub="Add stops in the route planner." />
                      : <Timeline items={d.stopList.map((s) => ({
                        time: s.pickupTime, title: s.name, tone: s.done ? 'teal' : 'muted',
                        body: s.students ? `${s.boarded}/${s.students} boarded here` : '',
                      }))} />}
                  </div>
                </Card>
                <Card title="Boarding and de-boarding" sub="Confirmed by the attendant device" flush
                  actions={<Button size="sm" variant="quiet" to={`/boarding?route=${selected.code}`}>Open</Button>}>
                  {!d ? <div className="card__body"><Skeleton height={160} /></div> : (
                    <DataTable
                      compact
                      rows={d.students}
                      rowKey={(r) => r.id}
                      emptyText="No students assigned to this route."
                      columns={[
                        { key: 'student', label: 'Student', render: (r) => <StudentLink id={r.id} name={r.fullName} meta={[gradeOf(r.grade, r.section), r.stopName].filter(Boolean).join(' · ')} /> },
                        { key: 'board', label: 'Boarded', render: (r) => r.boardedAt ? <Badge tone="success" icon="check">{fmt.time(r.boardedAt)}</Badge> : <span className="t-faint">—</span> },
                        { key: 'off', label: 'De-boarded', render: (r) => r.deboardedAt ? <Badge tone="success" icon="check">{fmt.time(r.deboardedAt)}</Badge> : <TimeCell value={null} /> },
                      ]}
                    />
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {modal === 'status' && selected && <RunStatusModal route={selected} onClose={() => setModal(null)} />}
      {modal === 'notify' && selected && <NotifyModal route={selected} onClose={() => setModal(null)} />}
    </Page>
  );
}

function Stat({ label, value, critical }: { label: string; value: string; critical?: boolean }) {
  return (
    <div className="statstrip__item" style={{ border: 0, padding: 0 }}>
      <div className="statstrip__label">{label}</div>
      <div className={`statstrip__value${critical ? ' t-critical' : ''}`}>{value}</div>
    </div>
  );
}

export function RunStatusModal({ route, onClose }: { route: RouteRow; onClose: () => void }) {
  const [f, setF] = useState({ runStatus: route.runStatus as string, delayMinutes: String(route.delayMinutes || ''), etaText: '', reason: '', notifyParents: true });
  const fe = useFieldErrors();
  useEffect(() => {
    if (f.runStatus !== 'Delayed' && f.runStatus !== 'En route') setF((x) => ({ ...x, delayMinutes: '' }));
  }, [f.runStatus]);
  const save = useApiMutation<Record<string, unknown>>('patch', `/transport/routes/${route.id}/run`, { invalidate: TRANSPORT_KEYS, onSuccess: onClose });
  const delayAllowed = f.runStatus === 'Delayed' || f.runStatus === 'En route';
  const submit = () => {
    const e: Record<string, string> = {};
    const mins = Number(f.delayMinutes || 0);
    if (!Number.isInteger(mins) || mins < 0 || mins > 240) e.delayMinutes = 'Enter 0–240 minutes';
    if (f.runStatus === 'Delayed' && mins < 1) e.delayMinutes = 'Enter how many minutes late';
    fe.setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({
      runStatus: f.runStatus, delayMinutes: delayAllowed ? mins : 0, notifyParents: f.notifyParents,
      ...(f.etaText.trim() ? { etaText: f.etaText.trim() } : {}),
      ...(f.reason.trim() ? { reason: f.reason.trim() } : {}),
    }, { onError: fe.fromServer });
  };
  return (
    <FormModal title={`Update ${busLabel(route)} run`} sub={`${route.name} · ${route.students} students`} onClose={onClose}
      busy={save.isPending} error={save.error} fieldErrors={fe.errors} onSubmit={submit} submitLabel="Save status">
      <div className="form-grid">
        <SelectField label="Run status" required value={f.runStatus} onChange={(v) => setF((x) => ({ ...x, runStatus: v }))} options={RUN_STATUSES} />
        <TextField label="Delay (minutes)" type="number" min={0} max={240} value={f.delayMinutes} disabled={!delayAllowed}
          required={f.runStatus === 'Delayed'} onChange={(v) => { setF((x) => ({ ...x, delayMinutes: v })); fe.clear('delayMinutes'); }} error={fe.errors.delayMinutes} />
        <TextField label="ETA text" value={f.etaText} maxLength={40} placeholder="e.g. 12 min" onChange={(v) => setF((x) => ({ ...x, etaText: v }))}
          hint="Leave blank to set it automatically" />
        <TextField label="Reason" value={f.reason} maxLength={200} placeholder="Road closure at Vallancheri" onChange={(v) => setF((x) => ({ ...x, reason: v }))} />
        <div className="span-2">
          <Checkbox checked={f.notifyParents} onChange={(v) => setF((x) => ({ ...x, notifyParents: v }))}
            label={`Notify parents on this route about delays or a cancelled run (${route.students} students)`} />
        </div>
      </div>
    </FormModal>
  );
}

function NotifyModal({ route, onClose }: { route: RouteRow; onClose: () => void }) {
  const [message, setMessage] = useState(route.delayMinutes ? `${busLabel(route)} is running about ${route.delayMinutes} minutes late. Pickup times at every stop move by the same amount.` : '');
  const fe = useFieldErrors();
  const save = useApiMutation<{ message: string }>('post', `/transport/routes/${route.id}/notify`, { onSuccess: onClose });
  return (
    <FormModal title={`Message parents on ${route.name}`} sub={`${route.students} students · in-app, WhatsApp and push`} onClose={onClose}
      busy={save.isPending} error={save.error} fieldErrors={fe.errors} submitLabel="Send to parents" submitIcon="send"
      onSubmit={() => {
        if (message.trim().length < 5) return fe.setErrors({ message: 'Write a short message (at least 5 characters)' });
        save.mutate({ message: message.trim() }, { onError: fe.fromServer });
      }}>
      <Banner icon="info">Only the guardians of students assigned to this route receive the message.</Banner>
      <div className="mt-4">
        <TextArea label="Message" required rows={4} maxLength={500} value={message} onChange={(v) => { setMessage(v); fe.clear('message'); }} error={fe.errors.message} />
      </div>
    </FormModal>
  );
}
