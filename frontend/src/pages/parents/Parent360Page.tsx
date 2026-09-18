import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nProvider';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  Avatar, Badge, Banner, Button, Chart, charts, Empty, ErrorState, Icon, Meter, Modal, Skeleton, Status, TextArea, TextField,
  Timeline, useConfirm, useToast,
} from '@/components/ui';
import { TrackingPanel, TrackingStatusPill } from '@/components/tracking/TrackingPanel';
import type { CurrentLocation, StudentRow } from '@/api/types';
import { fmt } from '@/lib/format';
import type { Profile } from '../students/Student360Page';

type ChildRow = StudentRow & { relationship: string; isPrimary: boolean; canViewTracking: boolean; locationStatus: string | null; locationRecordedAt: string | null };
interface ParentMe {
  id: string; parentCode: string; fullName: string; phone: string; email: string | null; children: ChildRow[];
}
interface Overview {
  child: StudentRow;
  gateToday: { gate: string; direction: 'in' | 'out'; method: string; occurredAt: string }[];
  bus: {
    routeName: string; runStatus: string; delayMinutes: number; eta: string | null; busNo: string | null; registrationNo: string | null;
    driver: string | null; attendant: string | null; stopName: string | null; pickupTime: string | null; dropTime: string | null;
    boardingToday: { type: 'boarded' | 'deboarded'; at: string }[] | null;
  } | null;
  homework: { id: string; subject: string; title: string; dueOn: string; status: string; submitted: boolean }[];
  fees: { billed: number; paid: number; outstanding: number; nextDue: string | null };
  notifications: { id: string; category: string; tone: string; icon: string; title: string; body: string | null; route: string | null; createdAt: string }[];
  events: { id: string; title: string; startsOn: string; endsOn: string | null; venue: string | null; audience: string }[];
  pickup: { id: string; personName: string; relation: string; method: string; status: string; lastPickupAt: string | null }[];
}

type Tab = 'home' | 'track' | 'academics' | 'safety' | 'fees' | 'more';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'track', label: 'Track', icon: 'mapPin' },
  { id: 'academics', label: 'Academics', icon: 'bookOpen' },
  { id: 'safety', label: 'Safety', icon: 'shield' },
  { id: 'fees', label: 'Fees', icon: 'wallet' },
  { id: 'more', label: 'More', icon: 'menu' },
];

function MCard({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`mcard ${className ?? ''}`} style={{ margin: '0 12px 12px', ...style }}>{children}</div>;
}
function MSection({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="row between" style={{ padding: '16px 16px 8px' }}>
      <span className="t-sm t-bold">{title}</span>
      {right}
    </div>
  );
}

/** Wraps the portal in the wireframe's mobile app frame (centred on desktop). */
function AppFrame({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="page page--flush" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="sr-only">Parent 360 — {TABS.find((x) => x.id === tab)?.label}</h1>
      <div className="device__screen" style={{ height: 'auto', minHeight: 'calc(100vh - var(--topbar-h))', borderRadius: 0, background: 'var(--bg)' }}>
        <div className="device__scroll" style={{ paddingBottom: 72 }}>{children}</div>
        <div className="tabbar" role="tablist" style={{ position: 'sticky', bottom: 0, zIndex: 5 }}>
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" className="tabbar__item" aria-selected={x.id === tab} onClick={() => onTab(x.id)}>
              <Icon name={x.icon} size={19} />
              <span>{t(x.label)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Parent360Page() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const me = useApiQuery<ParentMe>('/parents/me');
  const tab = (sp.get('tab') as Tab) || 'home';
  const children = me.data?.children ?? [];
  const childId = sp.get('child') && children.some((c) => c.id === sp.get('child')) ? sp.get('child')! : children[0]?.id;
  const child = children.find((c) => c.id === childId);

  const setParam = (k: string, v: string | null) =>
    setSp((p) => {
      const n = new URLSearchParams(p);
      if (v) n.set(k, v); else n.delete(k);
      return n;
    }, { replace: k === 'child' });
  // Braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (me.isLoading) return <div className="page"><Skeleton height={420} /></div>;
  if (me.error) return <div className="page"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  if (!children.length || !child) {
    return <div className="page"><Empty icon="users" title="No children are linked to your account" sub="Please contact the school office to link your child's record." /></div>;
  }
  const pid = me.data!.id;
  const onTab = (x: Tab) => setParam('tab', x === 'home' ? null : x);

  return (
    <AppFrame tab={tab} onTab={onTab}>
      {tab === 'home' && <HomeTab parent={me.data!} child={child} children={children} onChild={(id) => setParam('child', id)} onTab={onTab} firstName={user?.fullName.split(' ')[0] ?? ''} />}
      {tab === 'track' && <TrackTab pid={pid} child={child} children={children} onChild={(id) => setParam('child', id)} />}
      {tab === 'academics' && <AcademicsTab child={child} />}
      {tab === 'safety' && <SafetyTab pid={pid} child={child} onTab={onTab} />}
      {tab === 'fees' && <FeesTab child={child} />}
      {tab === 'more' && <MoreTab child={child} />}
    </AppFrame>
  );
}

function ChildSwitcher({ child, children, onChild, dark }: { child: ChildRow; children: ChildRow[]; onChild: (id: string) => void; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="row g-3" onClick={() => setOpen(true)} aria-haspopup="dialog"
        style={{
          width: '100%', borderRadius: 10, padding: '10px 12px', textAlign: 'left',
          ...(dark ? { background: 'rgba(255,255,255,.1)', border: '1px solid rgba(254,219,110,.25)' } : { background: 'var(--surface)', border: '1px solid var(--border)' }),
        }}>
        <Avatar name={child.fullName} tone="avatar--amber" src={child.photoUrl} />
        <span className="col grow">
          <span className="t-sm t-bold" style={dark ? { color: '#fff' } : undefined}>{child.firstName} — {child.grade}{child.section}</span>
          <span className="t-micro" style={{ color: dark ? 'var(--gold)' : 'var(--text-muted)' }}>{child.campusName}{child.house ? ` · ${child.house} House` : ''}</span>
        </span>
        {children.length > 1 && <span className="t-micro" style={dark ? { color: '#fff' } : undefined}>{children.length} children</span>}
        <Icon name="chevronDown" size={16} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose a child">
        <div className="col g-2">
          {children.map((c) => (
            <button key={c.id} type="button" className="optioncard" aria-pressed={c.id === child.id} onClick={() => { onChild(c.id); setOpen(false); }}>
              <Avatar name={c.fullName} />
              <span className="col grow"><span className="t-sm t-bold">{c.fullName}</span><span className="t-xs t-muted">{c.grade}{c.section} · {c.admissionNo}</span></span>
              {c.id === child.id ? <Badge tone="success">Selected</Badge> : <Icon name="chevronRight" size={16} />}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
function HomeTab({ parent, child, children, onChild, onTab, firstName }: {
  parent: ParentMe; child: ChildRow; children: ChildRow[]; onChild: (id: string) => void; onTab: (t: Tab) => void; firstName: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ov = useApiQuery<Overview>(`/parents/${parent.id}/children/${child.id}/overview`, undefined, { refetchInterval: 60_000 });
  const prof = useApiQuery<Profile>(`/students/${child.id}/profile`);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const greet = hour < 12 ? t('Good Morning') : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const d = ov.data;
  const entry = d?.gateToday.find((g) => g.direction === 'in');
  const exit = [...(d?.gateToday ?? [])].reverse().find((g) => g.direction === 'out');
  const openHw = d?.homework.filter((h) => !h.submitted) ?? [];

  return (
    <>
      <div style={{ background: 'linear-gradient(135deg,var(--magenta-dark),var(--magenta-deep))', color: '#fff', padding: '14px 16px 24px' }}>
        <div className="row between">
          <div>
            <div className="t-micro" style={{ color: 'var(--gold)' }}>{greet}</div>
            <div className="serif" style={{ fontSize: 20, fontWeight: 700 }}>{firstName}</div>
          </div>
          <div className="row g-2">
            <button type="button" className="iconbtn iconbtn--onnavy" aria-label="Notifications" onClick={() => navigate('/notifications')}><Icon name="bell" size={20} /></button>
            <button type="button" className="iconbtn iconbtn--onnavy" aria-label="Messages" onClick={() => onTab('more')}><Icon name="message" size={20} /></button>
          </div>
        </div>
        <div style={{ marginTop: 14 }}><ChildSwitcher child={child} children={children} onChild={onChild} dark /></div>
      </div>

      <div style={{ marginTop: -10 }}>
        {ov.error ? <div style={{ padding: 12 }}><ErrorState error={ov.error} onRetry={() => ov.refetch()} /></div> : ov.isLoading ? (
          <MCard><Skeleton height={60} /></MCard>
        ) : (
          <>
            <MCard>
              <div className="row g-3">
                <span className={`avatar ${entry ? 'avatar--teal' : ''} none`}><Icon name={entry ? 'shieldCheck' : 'clock'} size={18} /></span>
                <div className="grow">
                  <div className="t-sm t-bold">
                    {exit ? `Left campus at ${fmt.time(exit.occurredAt)}` : entry ? `Arrived safely at ${fmt.time(entry.occurredAt)}` : child.today === 'absent' ? 'Marked absent today' : 'No gate entry yet today'}
                  </div>
                  <div className="t-micro t-muted">{entry ? `${entry.gate} · ${entry.method} verified` : 'You will be notified when your child reaches school'}</div>
                </div>
                {entry && !exit && <Badge tone="success" dot>Inside campus</Badge>}
              </div>
            </MCard>

            <MCard>
              <div className="row between">
                <div className="row g-3">
                  <span className="avatar avatar--teal none"><Icon name="mapPin" size={18} /></span>
                  <div>
                    <div className="t-sm t-bold">Track {child.firstName}</div>
                    <div className="t-micro t-muted">
                      {child.locationRecordedAt ? `Last update ${fmt.relative(child.locationRecordedAt)}` : child.trackingStatus === 'disabled' ? 'Tracking is not enabled' : 'No location yet'}
                    </div>
                  </div>
                </div>
                {child.trackingStatus && <TrackingStatusPill status={child.trackingStatus === 'active' ? 'Tracking Active' : child.trackingStatus === 'paused' ? 'Tracking Paused' : child.trackingStatus === 'offline' ? 'Offline' : 'Tracking Disabled'} />}
              </div>
              <div className="mt-3"><Button size="sm" block icon="mapPin" variant="primary" onClick={() => onTab('track')}>Open live location</Button></div>
            </MCard>

            {d?.bus && (
              <MCard>
                <div className="row g-3">
                  <span className="avatar none" style={{ background: 'var(--navy)', color: '#fff' }}><Icon name="bus" size={18} /></span>
                  <div className="grow">
                    <div className="t-sm t-bold">{d.bus.busNo ?? d.bus.routeName} — {d.bus.routeName}</div>
                    <div className="t-micro t-muted">Home stop {d.bus.stopName ?? '—'} · pickup {d.bus.pickupTime?.slice(0, 5) ?? '—'} · drop {d.bus.dropTime?.slice(0, 5) ?? '—'}</div>
                  </div>
                  <Status value={d.bus.runStatus} />
                </div>
                <div className="mt-3"><Button size="sm" block icon="bus" onClick={() => onTab('safety')}>Track bus</Button></div>
              </MCard>
            )}

            <MSection title="This week" />
            <div style={{ padding: '0 12px 12px' }}>
              <div className="grid g-2col g-3">
                {([
                  ['Attendance', child.attendance != null ? `${child.attendance}%` : '—', 'success', 'checkSquare', 'academics'],
                  ['Homework', `${openHw.length} open`, 'warning', 'edit', 'academics'],
                  ['Average', child.average != null ? `${child.average}` : '—', 'info', 'trending', 'academics'],
                  ['Fees due', d ? fmt.money(d.fees.outstanding) : '—', d && d.fees.outstanding > 0 ? 'critical' : 'success', 'wallet', 'fees'],
                ] as const).map(([label, value, tone, icon, go]) => (
                  <button type="button" className="mcard" key={label} style={{ textAlign: 'left' }} onClick={() => onTab(go)}>
                    <div className="row g-2"><Icon name={icon} size={15} /><span className="t-micro t-muted">{label}</span></div>
                    <div className={`t-bold t-${tone}`} style={{ fontSize: 17, marginTop: 4 }}>{value}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <MSection title="Academic progress" right={<button type="button" className="t-xs" style={{ color: 'var(--magenta)' }} onClick={() => onTab('academics')}>See all</button>} />
        <MCard>
          {prof.isLoading ? <Skeleton height={120} /> : prof.data?.academics.subjects.length ? prof.data.academics.subjects.slice(0, 4).map((s) => (
            <div style={{ marginBottom: 10 }} key={s.name}><Meter label={s.name} value={s.score} right={`${s.score} · ${s.grade}`} tone={s.score >= 80 ? 'teal' : s.score >= 70 ? 'info' : 'amber'} /></div>
          )) : <p className="t-sm t-muted">Results will appear after the first assessment.</p>}
        </MCard>

        {prof.data?.achievements[0] && (
          <>
            <MSection title="Achievements" />
            <MCard>
              <div className="row g-3">
                <span className="avatar avatar--amber none"><Icon name="award" size={18} /></span>
                <div className="grow">
                  <div className="t-sm t-bold">{prof.data.achievements[0].title}</div>
                  <div className="t-micro t-muted">{fmt.date(prof.data.achievements[0].date)} · {prof.data.achievements[0].verified ? 'verified by the school' : 'awaiting verification'}</div>
                </div>
              </div>
            </MCard>
          </>
        )}

        {!!d?.notifications.length && (
          <>
            <MSection title="Latest updates" right={<button type="button" className="t-xs" style={{ color: 'var(--magenta)' }} onClick={() => navigate('/notifications')}>All</button>} />
            <MCard>
              {d.notifications.slice(0, 4).map((n) => (
                <button type="button" className="mrow" key={n.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => n.route && navigate(n.route)}>
                  <Icon name={n.icon} size={16} className={`t-${n.tone === 'warning' ? 'warning' : n.tone === 'critical' ? 'critical' : 'muted'}`} />
                  <span className="grow"><span className="t-sm">{n.title}</span><div className="t-micro t-muted">{fmt.relative(n.createdAt)}</div></span>
                </button>
              ))}
            </MCard>
          </>
        )}

        <MSection title="School events" />
        <div style={{ padding: '0 12px 16px' }}>
          {d?.events.length ? d.events.slice(0, 3).map((e) => (
            <div className="mcard" style={{ marginBottom: 8 }} key={e.id}>
              <div className="row g-3">
                <span className="col none t-center" style={{ width: 44 }}>
                  <span className="t-micro t-muted">{fmt.dateShort(e.startsOn).split(' ')[1]}</span>
                  <span className="t-bold" style={{ fontSize: 16 }}>{fmt.dateShort(e.startsOn).split(' ')[0]}</span>
                </span>
                <span className="col grow"><span className="t-sm t-bold">{e.title}</span><span className="t-micro t-muted">{e.venue ?? e.audience}</span></span>
              </div>
            </div>
          )) : <p className="t-sm t-muted" style={{ padding: '0 4px' }}>No upcoming events.</p>}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function TrackTab({ pid, child, children, onChild }: { pid: string; child: ChildRow; children: ChildRow[]; onChild: (id: string) => void }) {
  return (
    <>
      <div className="appbar"><span className="t-bold">Track {child.firstName}</span></div>
      <div style={{ padding: 12 }} className="col g-3">
        {children.length > 1 && <ChildSwitcher child={child} children={children} onChild={onChild} />}
        {child.canViewTracking ? (
          <TrackingPanel
            compact
            locationPath={`/parents/${pid}/children/${child.id}/location`}
            historyPath={`/parents/${pid}/children/${child.id}/location/history`}
            historyNote="You can review the last 7 days of your child's movements."
            refetchMs={30_000}
          />
        ) : (
          <Empty icon="lock" title="Tracking is not available" sub="Location sharing for this child is not enabled on your account. Please contact the school office." />
        )}
        <Banner tone="neutral" icon="lock">Only you and authorised school staff can see this location. Every view is recorded in the school's audit trail.</Banner>
      </div>
    </>
  );
}

/** Dedicated route used by notifications: /parent-360/track/:studentId */
export function TrackChildPage() {
  const { studentId } = useParams();
  const me = useApiQuery<ParentMe>('/parents/me');
  const navigate = useNavigate();
  if (me.isLoading) return <div className="page"><Skeleton height={420} /></div>;
  if (me.error) return <div className="page"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  const child = me.data!.children.find((c) => c.id === studentId || c.admissionNo === studentId);
  if (!child) return <div className="page"><Empty icon="search" title="Child not found" sub="This child is not linked to your account." action={<Button to="/parent-360">Back to Parent 360</Button>} /></div>;
  return (
    <AppFrame tab="track" onTab={(t) => navigate(`/parent-360?child=${child.id}${t === 'home' ? '' : `&tab=${t}`}`)}>
      <TrackTab pid={me.data!.id} child={child} children={me.data!.children} onChild={(id) => navigate(`/parent-360/track/${id}`)} />
    </AppFrame>
  );
}

// ---------------------------------------------------------------------------
function AcademicsTab({ child }: { child: ChildRow }) {
  const prof = useApiQuery<Profile>(`/students/${child.id}/profile`);
  const { user } = useAuth();
  const ov = useApiQuery<Overview>(user?.parentId ? `/parents/${user.parentId}/children/${child.id}/overview` : null);
  if (prof.isLoading) return <div style={{ padding: 12 }}><Skeleton height={300} /></div>;
  if (prof.error || !prof.data) return <div style={{ padding: 12 }}><ErrorState error={prof.error} onRetry={() => prof.refetch()} /></div>;
  const d = prof.data;
  const trend = d.academics.termTrend;
  return (
    <>
      <div className="appbar"><span className="t-bold">Academics</span><span className="spacer" /><button type="button" className="iconbtn iconbtn--onnavy" aria-label="Print" onClick={() => window.print()}><Icon name="printer" size={18} /></button></div>
      <div style={{ paddingTop: 12 }}>
        <MCard>
          <div className="row between mb-3"><span className="t-sm t-bold">Progress this year</span><Badge tone={child.risk === 'On Track' ? 'success' : 'warning'}>{child.risk}</Badge></div>
          {trend.length > 1 ? (
            <Chart svg={charts.line({ labels: trend.map((x) => x.label), series: [{ name: 'Average', values: trend.map((x) => x.value), color: 'var(--teal)' }], yMin: Math.max(0, Math.min(...trend.map((x) => x.value)) - 10), yMax: 100, height: 150, showDots: false })} />
          ) : <p className="t-sm t-muted">Progress appears after more assessments.</p>}
        </MCard>
        <MSection title="Subject performance" />
        <MCard>
          {d.academics.subjects.length ? d.academics.subjects.map((s) => (
            <div className="mrow" key={s.name}>
              <span className="grow"><span className="t-sm t-bold">{s.name}</span><div className="t-micro t-muted">{s.teacher ?? ''}</div></span>
              <span className="col t-right none">
                <span className="t-bold t-num">{s.score}</span>
                {s.trend != null && <span className={`t-micro ${s.trend >= 0 ? 't-success' : 't-critical'}`}>{s.trend >= 0 ? '+' : ''}{s.trend}</span>}
              </span>
            </div>
          )) : <p className="t-sm t-muted">No results yet.</p>}
        </MCard>
        <MSection title="Attendance" right={<span className="t-xs t-muted">{child.attendance != null ? `${child.attendance}% this year` : ''}</span>} />
        <MCard>
          {d.attendance.totals ? (
            <div className="grid g-2col g-3">
              <div><div className="t-micro t-muted">Present</div><div className="t-bold t-success">{d.attendance.totals.present}</div></div>
              <div><div className="t-micro t-muted">Late</div><div className="t-bold t-warning">{d.attendance.totals.late}</div></div>
              <div><div className="t-micro t-muted">Absent</div><div className="t-bold t-critical">{d.attendance.totals.absent}</div></div>
              <div><div className="t-micro t-muted">Leave</div><div className="t-bold">{d.attendance.totals.leave}</div></div>
            </div>
          ) : <p className="t-sm t-muted">No attendance marked yet.</p>}
        </MCard>
        <MSection title="Homework" right={<span className="t-xs t-muted">{ov.data ? `${ov.data.homework.filter((h) => !h.submitted).length} open` : ''}</span>} />
        <MCard>
          {ov.data?.homework.length ? ov.data.homework.map((h) => (
            <div className="mrow" key={h.id}>
              <span className="grow"><span className="t-sm">{h.title}</span><div className="t-micro t-muted">{h.subject} · due {fmt.dateShort(h.dueOn)}</div></span>
              <Badge tone={h.submitted ? 'success' : 'info'}>{h.submitted ? 'Submitted' : 'Open'}</Badge>
            </div>
          )) : <p className="t-sm t-muted">No open homework.</p>}
        </MCard>
        <MSection title="Recent assessments" />
        <MCard>
          {d.academics.assessments.length ? d.academics.assessments.slice(0, 5).map((a) => (
            <div className="mrow" key={a.code}>
              <span className="grow"><span className="t-sm t-bold">{a.name}</span><div className="t-micro t-muted">{fmt.dateShort(a.heldOn)} · {a.maxMarks} marks</div></span>
              {a.isAbsent ? <Badge tone="critical">Absent</Badge> : <span className="t-bold t-num">{a.marks ?? '—'}</span>}
            </div>
          )) : <p className="t-sm t-muted">No assessment results yet.</p>}
        </MCard>
        <div style={{ height: 16 }} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
interface FamilySafety {
  bus: { busLocation: { latitude: number; longitude: number; recordedAt: string } | null } | null;
}

function SafetyTab({ pid, child, onTab }: { pid: string; child: ChildRow; onTab: (t: Tab) => void }) {
  const ov = useApiQuery<Overview>(`/parents/${pid}/children/${child.id}/overview`, undefined, { refetchInterval: 60_000 });
  const extra = useApiQuery<FamilySafety>(`/family/children/${child.id}/safety`, undefined, { refetchInterval: 60_000 });
  const loc = useApiQuery<CurrentLocation>(`/parents/${pid}/children/${child.id}/location`);
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ personName: '', relation: '', phone: '', method: 'OTP + ID' });
  const addPickup = useApiMutation<typeof form>('post', `/family/children/${child.id}/pickup`, {
    invalidate: [`/parents/${pid}/children/${child.id}`, `/family/children/${child.id}`], success: 'Request sent to the school office for verification',
    onSuccess: () => { setAdding(false); setForm({ personName: '', relation: '', phone: '', method: 'OTP + ID' }); },
  });
  const pickupAction = useApiMutation<{ id: string; action: 'confirm' | 'revoke' }>('post', (v) => `/family/children/${child.id}/pickup/${v.id}/${v.action}`, {
    invalidate: [`/parents/${pid}/children/${child.id}`, `/family/children/${child.id}`],
    success: (_r, v) => (v.action === 'confirm' ? 'Pickup person confirmed' : 'Pickup authorisation revoked'), body: () => ({}),
  });

  if (ov.isLoading) return <div style={{ padding: 12 }}><Skeleton height={300} /></div>;
  if (ov.error || !ov.data) return <div style={{ padding: 12 }}><ErrorState error={ov.error} onRetry={() => ov.refetch()} /></div>;
  const d = ov.data;
  const events = [
    ...d.gateToday.map((g) => ({ at: g.occurredAt, title: `${g.direction === 'in' ? 'Gate entry' : 'Gate exit'} — ${g.gate}`, tone: 'teal' })),
    ...(d.bus?.boardingToday ?? []).map((b) => ({ at: b.at, title: b.type === 'boarded' ? `Boarded ${d.bus?.busNo ?? 'the bus'}` : `Exited ${d.bus?.busNo ?? 'the bus'}`, tone: 'amber' })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const entry = d.gateToday.find((g) => g.direction === 'in');
  const phoneOk = /^\+?[0-9 ]{8,16}$/.test(form.phone);

  return (
    <>
      <div className="appbar"><span className="t-bold">Safety</span></div>
      <div style={{ paddingTop: 12 }}>
        <MCard>
          <div className="row g-3">
            <span className={`avatar ${entry ? 'avatar--teal' : ''} none`}><Icon name={entry ? 'shieldCheck' : 'clock'} size={18} /></span>
            <div className="grow">
              <div className="t-sm t-bold">{entry ? 'Child arrived safely' : 'Not yet at school today'}</div>
              <div className="t-micro t-muted">{entry ? `${entry.gate} · ${fmt.time(entry.occurredAt)} · ${entry.method} verified` : 'Gate entry will appear here'}</div>
            </div>
          </div>
          {events.length > 0 && (
            <div className="mt-3"><Timeline items={events.map((e) => ({ time: fmt.time(e.at), title: e.title, tone: e.tone }))} /></div>
          )}
        </MCard>

        <MSection title="Live location" right={<button type="button" className="t-xs" style={{ color: 'var(--magenta)' }} onClick={() => onTab('track')}>Open map</button>} />
        <MCard>
          {loc.data ? (
            <div className="row between g-3">
              <div>
                <div className="t-sm t-bold">{loc.data.placeLabel ?? loc.data.locationStatusLabel}</div>
                <div className="t-micro t-muted">{loc.data.recordedAt ? `Updated ${fmt.time(loc.data.recordedAt)}` : 'No location yet'}</div>
              </div>
              <TrackingStatusPill status={loc.data.displayStatus} />
            </div>
          ) : loc.error ? <p className="t-sm t-muted">Location is not available.</p> : <Skeleton height={36} />}
        </MCard>

        {d.bus && (
          <>
            <MSection title={`${d.bus.busNo ?? 'Bus'} — ${d.bus.routeName}`} />
            <MCard>
              <div className="row between">
                <span className="t-sm t-bold">{d.bus.runStatus === 'Delayed' ? `Running ${d.bus.delayMinutes} min late` : d.bus.eta ?? d.bus.runStatus}</span>
                <Status value={d.bus.runStatus === 'At campus' ? 'At campus' : d.bus.runStatus} />
              </div>
              <div className="t-micro t-muted mt-1">Driver {d.bus.driver ?? '—'}{d.bus.attendant ? ` · Attendant ${d.bus.attendant}` : ''}</div>
              {extra.data?.bus?.busLocation && (
                <div className="t-micro t-muted mt-1">Bus position updated {fmt.time(extra.data.bus.busLocation.recordedAt)}</div>
              )}
              <div className="t-micro t-muted mt-1">Stop {d.bus.stopName ?? '—'} · pickup {d.bus.pickupTime?.slice(0, 5) ?? '—'} · drop {d.bus.dropTime?.slice(0, 5) ?? '—'}</div>
            </MCard>
          </>
        )}

        <MSection title="Pickup authorisation" right={<button type="button" className="t-xs" style={{ color: 'var(--magenta)' }} onClick={() => setAdding(true)}>Add person</button>} />
        <MCard>
          {d.pickup.length ? d.pickup.map((p) => (
            <div className="mrow" key={p.id}>
              <Avatar name={p.personName} size="sm" />
              <span className="grow"><span className="t-sm">{p.personName}</span><div className="t-micro t-muted">{p.relation} · {p.method}</div></span>
              <Status value={p.status} />
              {p.status === 'Pending' && <Button size="sm" variant="teal" onClick={() => pickupAction.mutate({ id: p.id, action: 'confirm' })}>Confirm</Button>}
              <Button size="sm" variant="quiet" aria-label={`Revoke ${p.personName}`} icon="x" onClick={async () => {
                if (await confirm({ title: 'Revoke pickup authorisation?', body: `${p.personName} will no longer be allowed to collect ${child.firstName}.`, confirmLabel: 'Revoke', danger: true })) {
                  pickupAction.mutate({ id: p.id, action: 'revoke' });
                }
              }} />
            </div>
          )) : <p className="t-sm t-muted">No authorised pickup persons on record.</p>}
        </MCard>
        <div style={{ height: 16 }} />
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a pickup person" sub="The school office verifies every new person before the first pickup." busy={addPickup.isPending}
        foot={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" loading={addPickup.isPending} disabled={form.personName.trim().length < 2 || form.relation.trim().length < 2 || !phoneOk} onClick={() => addPickup.mutate(form)}>Send for verification</Button></>}>
        <div className="col g-3">
          <TextField label="Full name" required value={form.personName} onChange={(v) => setForm({ ...form, personName: v })} maxLength={120} autoFocus />
          <TextField label="Relationship" required value={form.relation} onChange={(v) => setForm({ ...form, relation: v })} placeholder="Grandfather, driver…" maxLength={40} />
          <TextField label="Mobile" required type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} error={form.phone && !phoneOk ? 'Enter a valid phone number' : undefined} />
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
interface FamilyFees {
  summary: { billed: number; paid: number; outstanding: number; nextDue: string | null };
  lines: { id: string; description: string; head: string; amountDue: number; concession: number; amountPaid: number; balance: number; dueDate: string; status: string }[];
  payments: { id: string; receiptNo: string; amount: number; method: string; paidAt: string; status: string }[];
}

function FeesTab({ child }: { child: ChildRow }) {
  const { t } = useI18n();
  const toast = useToast();
  const q = useApiQuery<FamilyFees>(`/family/children/${child.id}/fees`);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<'UPI' | 'Card' | 'Net Banking'>('UPI');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<{ receiptNo: string; amount: number; method: string; paidAt: string; gatewayRef?: string } | null>(null);
  const pay = useApiMutation<{ amount: number; method: string; feeIds: string[] }, { receiptNo: string; amount: number; method: string; paidAt: string; gatewayRef?: string }>(
    'post', `/family/children/${child.id}/fees/pay`, {
      invalidate: [`/family/children/${child.id}`, '/parents', '/notifications'],
      success: false,
      onSuccess: (r) => { setPaying(false); setReceipt(r.data); },
    });

  const open = useMemo(() => (q.data?.lines ?? []).filter((l) => l.balance > 0), [q.data]);
  useEffect(() => setSelected(new Set(open.map((l) => l.id))), [open]);
  const total = open.filter((l) => selected.has(l.id)).reduce((a, l) => a + l.balance, 0);

  if (q.isLoading) return <div style={{ padding: 12 }}><Skeleton height={300} /></div>;
  if (q.error || !q.data) return <div style={{ padding: 12 }}><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const d = q.data;

  return (
    <>
      <div className="appbar"><span className="t-bold">Fees</span><span className="spacer" /><Icon name="receipt" size={18} /></div>
      <div style={{ paddingTop: 12 }}>
        <MCard>
          <div className="t-micro t-muted">Total outstanding</div>
          <div className="serif" style={{ fontSize: 30, fontWeight: 600, color: d.summary.outstanding > 0 ? 'var(--critical)' : 'var(--success)' }}>{fmt.money(d.summary.outstanding)}</div>
          <div className="t-micro t-muted">{d.summary.nextDue ? `Next instalment due ${fmt.date(d.summary.nextDue)}` : 'All dues cleared'}</div>
          {d.summary.outstanding > 0 && (
            <div className="row g-2 mt-3"><Button variant="teal" block icon="creditCard" onClick={() => setPaying(true)}>{t('Pay Now')}</Button></div>
          )}
        </MCard>
        <MSection title="Account breakdown" />
        <MCard>
          {d.lines.length ? d.lines.map((l) => (
            <div className="mrow" key={l.id}>
              <span className="grow"><span className="t-sm">{l.description}</span><div className="t-micro t-muted">Due {fmt.date(l.dueDate)}{l.concession ? ` · concession ${fmt.money(l.concession)}` : ''}</div></span>
              <span className="col t-right none">
                <span className="t-sm t-bold t-num">{fmt.money(l.amountDue - l.concession)}</span>
                <Status value={l.status} />
              </span>
            </div>
          )) : <p className="t-sm t-muted">No charges this year.</p>}
        </MCard>
        <MSection title="Receipts" />
        <MCard>
          {d.payments.length ? d.payments.map((p) => (
            <div className="mrow" key={p.id}>
              <span className="grow"><span className="t-sm">{p.receiptNo}</span><div className="t-micro t-muted">Paid {fmt.date(p.paidAt)} · {p.method}</div></span>
              <span className="t-bold t-num">{fmt.money(p.amount)}</span>
            </div>
          )) : <p className="t-sm t-muted">No payments yet.</p>}
        </MCard>
        <div style={{ height: 16 }} />
      </div>

      <Modal open={paying} onClose={() => setPaying(false)} title="Pay fees" sub={`${child.fullName} · ${child.grade}${child.section}`} busy={pay.isPending}
        foot={<><Button onClick={() => setPaying(false)} disabled={pay.isPending}>Cancel</Button><Button variant="teal" icon="lock" loading={pay.isPending} disabled={!total}
          onClick={() => pay.mutate({ amount: total, method, feeIds: [...selected] }, { onError: (e) => toast(e.message, 'critical') })}>Pay {fmt.money(total)}</Button></>}>
        <div className="col g-3">
          <div className="card card--tint" style={{ padding: 14 }}>
            {open.map((l) => (
              <label className="row between mt-2 check" key={l.id} style={{ width: '100%' }}>
                <span className="row g-2">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} />
                  <span className="t-sm">{l.description}</span>
                </span>
                <span className="t-bold t-num">{fmt.money(l.balance)}</span>
              </label>
            ))}
            <div className="divider" style={{ margin: '10px 0' }} />
            <div className="row between"><span className="t-sm t-bold">Total</span><span className="t-bold t-num" style={{ fontSize: 17 }}>{fmt.money(total)}</span></div>
          </div>
          <div className="eyebrow mt-2">Payment method</div>
          <div className="col g-2">
            {(['UPI', 'Card', 'Net Banking'] as const).map((m) => (
              <label className="check card" style={{ padding: '12px 14px' }} key={m}>
                <input type="radio" name="pm" checked={method === m} onChange={() => setMethod(m)} />
                <Icon name={m === 'UPI' ? 'zap' : m === 'Card' ? 'creditCard' : 'building'} size={15} /> {m}
              </label>
            ))}
          </div>
          <Banner tone="neutral" icon="info">No payment gateway is connected in this environment. The payment is simulated and recorded; a real gateway plugs into the same flow.</Banner>
        </div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Payment successful" foot={<Button variant="primary" onClick={() => setReceipt(null)}>Done</Button>}>
        {receipt && (
          <>
            <div className="t-center" style={{ padding: '16px 0' }}>
              <div className="avatar avatar--teal" style={{ width: 62, height: 62, margin: '0 auto' }}><Icon name="check" size={28} /></div>
              <div className="h2 mt-4">{fmt.money(receipt.amount)} paid</div>
              <p className="t-sm t-muted mt-2">Receipt {receipt.receiptNo} issued. A copy has been queued to your registered WhatsApp number.</p>
            </div>
            <dl className="dl">
              <dt>Paid on</dt><dd>{fmt.dateTime(receipt.paidAt)}</dd>
              <dt>Method</dt><dd>{receipt.method}</dd>
              {receipt.gatewayRef && (<><dt>Reference</dt><dd>{receipt.gatewayRef}</dd></>)}
              <dt>Student</dt><dd>{child.fullName} · {child.admissionNo}</dd>
            </dl>
          </>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
interface FamilyPtm { id: string; teacher: string; subjectLabel: string; sessionDate: string; startsAt: string; slotMinutes: number; totalSlots: number; freeSlots: number[]; myBooking?: { id: string; slotNo: number; status: string } | null }
interface FamilyCircular { id: string; title: string; publishedAt: string; audience: string; requiresAck: boolean; acknowledged: boolean; body?: string }
interface Thread { id: string; subject: string; lastMessageAt: string; status: string; studentName?: string | null; unread?: boolean }

function MoreTab({ child }: { child: ChildRow }) {
  const { setLang, langs, lang } = useI18n();
  const ptm = useApiQuery<FamilyPtm[]>('/family/ptm', { studentId: child.id });
  const circulars = useApiQuery<FamilyCircular[]>('/family/circulars');
  const threads = useApiQuery<Thread[]>('/family/messages');
  const [booking, setBooking] = useState<FamilyPtm | null>(null);
  const [composing, setComposing] = useState(false);
  const [msg, setMsg] = useState({ subject: '', body: '' });
  const [openCircular, setOpenCircular] = useState<FamilyCircular | null>(null);
  const toast = useToast();

  const ack = useApiMutation<string>('post', (id) => `/family/circulars/${id}/acknowledge`, { invalidate: ['/family/circulars', '/tasks'], success: 'Acknowledged — recorded against your child', body: () => ({}) });
  const book = useApiMutation<{ sessionId: string; slotNo: number }>('post', (v) => `/family/ptm/${v.sessionId}/book`, {
    invalidate: ['/family/ptm', '/tasks'], body: (v) => ({ studentId: child.id, slotNo: v.slotNo }), success: 'PTM slot booked', onSuccess: () => setBooking(null),
  });
  const cancel = useApiMutation<string>('post', (id) => `/family/ptm/bookings/${id}/cancel`, { invalidate: ['/family/ptm'], success: 'Booking cancelled', body: () => ({}) });
  const send = useApiMutation<typeof msg>('post', '/family/messages', {
    invalidate: ['/family/messages'], body: (v) => ({ ...v, studentId: child.id }), success: 'Message sent to the class teacher',
    onSuccess: () => { setComposing(false); setMsg({ subject: '', body: '' }); },
  });
  const pending = circulars.data?.filter((c) => c.requiresAck && !c.acknowledged).length ?? 0;

  const slotTime = (s: FamilyPtm, n: number) => {
    const [h, m] = s.startsAt.split(':').map(Number);
    const mins = h * 60 + m + (n - 1) * s.slotMinutes;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  };

  return (
    <>
      <div className="appbar"><span className="t-bold">More</span></div>
      <div style={{ paddingTop: 12 }}>
        <MSection title="Parent–teacher meeting" />
        <MCard>
          {ptm.error ? <p className="t-sm t-muted">PTM booking is not available right now.</p> : ptm.isLoading ? <Skeleton height={80} /> : ptm.data?.length ? ptm.data.map((p) => (
            <div className="mrow" key={p.id}>
              <span className="grow">
                <span className="t-sm t-bold">{p.teacher}</span>
                <div className="t-micro t-muted">{p.subjectLabel} · {fmt.date(p.sessionDate)}</div>
                <div className={`t-micro ${p.freeSlots.length ? 't-muted' : 't-critical'}`}>
                  {p.myBooking ? `Booked · ${slotTime(p, p.myBooking.slotNo)}` : `${p.freeSlots.length} of ${p.totalSlots} slots left`}
                </div>
              </span>
              {p.myBooking ? (
                <Button size="sm" onClick={() => cancel.mutate(p.myBooking!.id)} loading={cancel.isPending}>Cancel</Button>
              ) : (
                <Button size="sm" variant={p.freeSlots.length ? 'primary' : 'ghost'} disabled={!p.freeSlots.length} onClick={() => setBooking(p)}>{p.freeSlots.length ? 'Book' : 'Full'}</Button>
              )}
            </div>
          )) : <p className="t-sm t-muted">No PTM sessions are open for booking.</p>}
        </MCard>

        <MSection title="Circulars" right={<span className="t-xs t-muted">{pending ? `${pending} need acknowledgement` : ''}</span>} />
        <MCard>
          {circulars.error ? <p className="t-sm t-muted">Circulars are not available right now.</p> : circulars.isLoading ? <Skeleton height={80} /> : circulars.data?.length ? circulars.data.slice(0, 6).map((c) => (
            <div className="mrow" key={c.id}>
              <button type="button" className="grow" style={{ textAlign: 'left' }} onClick={() => setOpenCircular(c)}>
                <span className="t-sm">{c.title}</span>
                <div className="t-micro t-muted">{fmt.date(c.publishedAt)} · {c.audience}</div>
              </button>
              {c.requiresAck && (c.acknowledged ? <Badge tone="success" icon="check">Acknowledged</Badge> : <Button size="sm" onClick={() => ack.mutate(c.id)} loading={ack.isPending}>Acknowledge</Button>)}
            </div>
          )) : <p className="t-sm t-muted">No circulars.</p>}
        </MCard>

        <MSection title="Messages" right={<button type="button" className="t-xs" style={{ color: 'var(--magenta)' }} onClick={() => setComposing(true)}>New message</button>} />
        <MCard>
          {threads.error ? <p className="t-sm t-muted">Messaging is not available right now.</p> : threads.data?.length ? threads.data.slice(0, 5).map((th) => (
            <div className="mrow" key={th.id}>
              <Icon name="message" size={16} />
              <span className="grow"><span className="t-sm">{th.subject}</span><div className="t-micro t-muted">{fmt.relative(th.lastMessageAt)}</div></span>
              <Status value={th.status} />
            </div>
          )) : <p className="t-sm t-muted">No conversations yet.</p>}
        </MCard>

        <MSection title="Contact the school" />
        <MCard>
          <button type="button" className="mrow" style={{ width: '100%', textAlign: 'left' }} onClick={() => setComposing(true)}><span className="grow t-sm">Message class teacher</span><Icon name="message" size={16} /></button>
          <button type="button" className="mrow" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setMsg({ subject: `Absence — ${child.firstName}`, body: '' }); setComposing(true); }}><span className="grow t-sm">Report an absence</span><Icon name="calendar" size={16} /></button>
          <div className="mrow">
            <span className="grow t-sm">Language</span>
            <div className="segment">
              {langs.map((l) => <button key={l.id} type="button" aria-pressed={l.id === lang} onClick={() => { setLang(l.id); toast(l.label, 'success', 'globe'); }}>{l.short}</button>)}
            </div>
          </div>
        </MCard>
        <div style={{ height: 16 }} />
      </div>

      <Modal open={!!booking} onClose={() => setBooking(null)} title="Book a PTM slot" sub={booking ? `${booking.teacher} · ${fmt.date(booking.sessionDate)}` : undefined} busy={book.isPending}
        foot={<Button onClick={() => setBooking(null)}>Close</Button>}>
        {booking && (
          <>
            <div className="grid g-3col g-2">
              {Array.from({ length: booking.totalSlots }, (_, i) => i + 1).map((n) => {
                const free = booking.freeSlots.includes(n);
                return (
                  <Button key={n} disabled={!free || book.isPending} onClick={() => book.mutate({ sessionId: booking.id, slotNo: n })}>
                    {slotTime(booking, n)}{free ? '' : ' · taken'}
                  </Button>
                );
              })}
            </div>
            <div className="mt-4"><Banner tone="neutral" icon="clock">Slots are {booking.slotMinutes} minutes. You will receive a reminder the evening before.</Banner></div>
          </>
        )}
      </Modal>

      <Modal open={composing} onClose={() => setComposing(false)} title="Message the class teacher" sub={`About ${child.fullName}`} busy={send.isPending}
        foot={<><Button onClick={() => setComposing(false)}>Cancel</Button><Button variant="primary" icon="send" loading={send.isPending}
          disabled={msg.subject.trim().length < 3 || msg.body.trim().length < 3} onClick={() => send.mutate({ subject: msg.subject.trim(), body: msg.body.trim() })}>Send</Button></>}>
        <div className="col g-3">
          <TextField label="Subject" required value={msg.subject} onChange={(v) => setMsg({ ...msg, subject: v })} maxLength={160} autoFocus />
          <TextArea label="Message" required value={msg.body} onChange={(v) => setMsg({ ...msg, body: v })} rows={5} maxLength={2000} />
        </div>
      </Modal>

      <Modal open={!!openCircular} onClose={() => setOpenCircular(null)} title={openCircular?.title ?? ''} sub={openCircular ? `${fmt.date(openCircular.publishedAt)} · ${openCircular.audience}` : undefined}
        foot={openCircular?.requiresAck && !openCircular.acknowledged
          ? <Button variant="primary" icon="check" onClick={() => { ack.mutate(openCircular.id); setOpenCircular(null); }}>Acknowledge</Button>
          : <Button onClick={() => setOpenCircular(null)}>Close</Button>}>
        <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>{openCircular?.body ?? 'Open the circular from the school notice to read the full text.'}</p>
      </Modal>
    </>
  );
}

