import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  AlertItem, Badge, Button, Card, DataTable, Empty, ErrorState, InlineError, Kpi, Meter, Modal, Page, PageSkeleton, Status,
  TextArea, TextField, useConfirm,
} from '@/components/ui';
import { fmt, todayKey } from '@/lib/format';
import { LeaveApplyModal, addDays, dayName, fieldErrors } from './shared';
import type { LeaveBalance, LeaveRow, MyEmployee, MyRosterDay, OvertimeRow, TaskRow } from './types';

interface Attendance { from: string; to: string; rows: { date: string; status: string; checkIn: string | null; checkOut: string | null; source: string }[]; summary: Record<string, number> }
interface Slip { id: string; payMonth: string; monthLabel: string; gross: number; deductions: number; net: number; releasedAt: string }
interface Request { id: string; kind: string; title: string; status: string; at: string }

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};
const firstName = (n: string) => n.replace(/^(Dr|Mr|Ms|Mrs|Nurse)\.?\s+/i, '').split(' ')[0];
const TONE: Record<string, string> = { Approved: 'success', Paid: 'success', Rejected: 'critical', Cancelled: 'neutral', Submitted: 'warning', 'Under Review': 'warning' };

export default function StaffSelfPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const me = useApiQuery<MyEmployee>('/me/employee');
  const linked = !(me.error instanceof ApiError && me.error.code === 'EMPLOYEE_NOT_LINKED');
  const on = !!me.data;
  const [week, setWeek] = useState<string | undefined>(undefined);
  const roster = useApiQuery<{ weekStart: string; defaultShift: string | null; days: MyRosterDay[] }>(on ? '/me/roster' : null, { weekStart: week });
  const attendance = useApiQuery<Attendance>(on ? '/me/attendance' : null);
  const balances = useApiQuery<LeaveBalance[]>(on ? '/me/leave-balances' : null);
  const leave = useApiQuery<LeaveRow[]>(on ? '/me/leave-requests' : null);
  const overtime = useApiQuery<OvertimeRow[]>(on ? '/me/overtime' : null);
  const slips = useApiQuery<Slip[]>(on ? '/me/payslips' : null);
  const tasks = useApiQuery<TaskRow[]>(on ? '/me/tasks' : null);
  const requests = useApiQuery<Request[]>(on ? '/me/requests' : null);
  const [applying, setApplying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const checkIn = useApiMutation<void>('post', '/me/attendance/check-in', { invalidate: ['/me'], body: () => ({}), success: 'Checked in' });
  const checkOut = useApiMutation<void>('post', '/me/attendance/check-out', { invalidate: ['/me'], body: () => ({}), success: 'Checked out' });
  const cancel = useApiMutation<string>('post', (id) => `/me/leave-requests/${id}/cancel`, { invalidate: ['/me'], body: () => ({}) });

  if (me.isLoading) return <Page><PageSkeleton /></Page>;
  if (!linked) {
    return (
      <Page>
        <Card><Empty icon="idCard" title="No employee record is linked to your account"
          sub={`Signed in as ${user?.fullName ?? ''}. Ask HR to link your account to your employee profile to see shifts, leave and payslips.`} /></Card>
      </Page>
    );
  }
  if (me.error || !me.data) return <Page><ErrorState error={me.error} onRetry={() => me.refetch()} /></Page>;

  const d = me.data;
  const e = d.employee;
  const shiftName = d.shift?.name ?? e.shift ?? 'No fixed shift';
  const shiftKind = shiftName.split(' ')[0];
  const shiftHours = shiftName.replace(/^\S+\s/, '');
  const today = d.rosterToday;
  const openTask = (tasks.data ?? [])[0];
  const lede = [
    today ? `${shiftKind} shift today — ${today.duty ?? today.group}.` : `No roster line today (${shiftKind} shift pattern).`,
    openTask ? `Next task: ${openTask.title}${openTask.dueOn ? ` by ${fmt.dateShort(openTask.dueOn)}` : ''}.` : 'No open tasks.',
  ].join(' ');
  const checkedIn = !!e.checkIn;
  const lastSlip = d.lastPayslip;

  return (
    <Page>
      <div className="pagehead">
        <div className="grow">
          <h1 className="display">{greeting()}, {firstName(e.fullName)}</h1>
          <p className="lede mt-2">{lede}</p>
        </div>
        <div className="pagehead__actions">
          {e.today !== 'On Leave' && (!checkedIn
            ? <Button icon="clock" loading={checkIn.isPending} onClick={() => checkIn.mutate()}>Check in</Button>
            : !e.checkOut && <Button icon="logout" loading={checkOut.isPending} onClick={async () => {
                if (await confirm({ title: 'Check out now?', body: `You checked in at ${e.checkIn}.`, confirmLabel: 'Check out' })) checkOut.mutate();
              }}>Check out</Button>)}
          <Button icon="clock" onClick={() => setClaiming(true)}>Claim overtime</Button>
          <Button variant="primary" icon="calendar" onClick={() => setApplying(true)}>Apply for leave</Button>
        </div>
      </div>

      <div className="grid g-4col">
        <Kpi label="Shift today" value={shiftKind} unit={shiftHours}
          foot={e.checkIn ? `Clocked in at ${e.checkIn}${e.checkOut ? ` · out ${e.checkOut}` : ''}` : e.today === 'On Leave' ? 'On leave today' : 'Not clocked in yet'} />
        <Kpi label="Leave balance" value={e.leaveBalance} unit="days" tone="teal" foot={`Of ${e.leaveEntitled} days this year`} />
        <Kpi label="Overtime this month" value={d.overtime.hours} unit="hours" tone="amber"
          foot={d.overtime.pending ? `${d.overtime.pending} h pending approval` : d.overtime.hours ? 'Approved' : 'No claims this month'} />
        <Kpi label="Last payslip" value={lastSlip ? fmt.money(lastSlip.net) : '—'} tone="info" foot={lastSlip ? `${lastSlip.monthLabel} — see below` : 'None released yet'} />
      </div>

      <div className="grid g-main mt-4">
        <Card title="My roster this week" flush actions={<>
          <Button size="sm" icon="chevronLeft" aria-label="Previous week" onClick={() => setWeek(addDays(roster.data?.weekStart ?? todayKey(), -7))} />
          <Button size="sm" icon="chevronRight" aria-label="Next week" onClick={() => setWeek(addDays(roster.data?.weekStart ?? todayKey(), 7))} />
        </>}>
          {roster.error ? <ErrorState error={roster.error} onRetry={() => roster.refetch()} /> : (
            <DataTable rows={roster.data?.days} loading={roster.isLoading} rowKey={(r) => r.date}
              rowClassName={(r) => (r.date === d.today ? 'is-selected' : undefined)}
              columns={[
                { key: 'day', label: 'Day', render: (r) => <>{dayName(r.date)}<div className="t-micro t-muted">{fmt.dateShort(r.date)}</div></> },
                { key: 'shift', label: 'Shift', render: (r) => r.onLeave ? 'Off' : r.shift ? r.shift.replace(/^\S+\s/, '') : <span className="t-faint">Off</span> },
                { key: 'duty', label: 'Duty', render: (r) => r.onLeave ? '—' : r.duty ?? '—' },
                { key: 'status', label: 'Status', render: (r) => {
                  if (r.onLeave) return <Status value="Leave" />;
                  if (r.date <= d.today && r.attendance) return <Status value={r.attendance} />;
                  if (r.rosterStatus) return <Status value={r.rosterStatus} />;
                  return <span className="t-faint">—</span>;
                } },
              ]} />
          )}
        </Card>
        <div className="col g-4">
          <Card title="My requests" flush>
            {requests.error ? <ErrorState error={requests.error} onRetry={() => requests.refetch()} /> : requests.isLoading ? (
              <div style={{ padding: 16 }}><span className="skeleton" style={{ display: 'block', height: 120 }} /></div>
            ) : requests.data?.length ? (
              <div>
                {requests.data.map((r) => (
                  <AlertItem key={r.kind + r.id} tone={TONE[r.status] ?? 'neutral'} icon={r.kind === 'leave' ? 'calendar' : r.kind === 'overtime' ? 'clock' : 'fileText'}
                    title={r.title} meta={`${r.status} · ${fmt.relative(r.at)}`} right={<Status value={r.status} />}
                    onClick={() => document.getElementById(r.kind === 'leave' ? 'my-leave' : r.kind === 'overtime' ? 'my-overtime' : 'my-requests')?.scrollIntoView({ behavior: 'smooth' })} />
                ))}
              </div>
            ) : <Empty icon="fileText" title="No requests yet" />}
          </Card>
          <Card title="Payslips" flush>
            {slips.error ? <ErrorState error={slips.error} onRetry={() => slips.refetch()} /> : (
              <DataTable compact rows={slips.data?.slice(0, 6)} loading={slips.isLoading} rowKey={(r) => r.id} emptyText="No payslips released yet."
                columns={[
                  { key: 'm', label: 'Month', render: (r) => r.monthLabel },
                  { key: 'net', label: 'Net pay', className: 'num', render: (r) => fmt.money(r.net) },
                  { key: 'a', label: '', className: 'num', render: (r) => <Button size="sm" icon="download" onClick={() => navigate(`/staff-self/payslips/${r.id}`)}>Download</Button> },
                ]} />
            )}
          </Card>
        </div>
      </div>

      <div className="grid g-2col g-4 mt-4">
        <Card title="Leave" id="my-leave" flush actions={<Button size="sm" icon="plus" onClick={() => setApplying(true)}>Apply</Button>}>
          <div className="col g-3" style={{ padding: 'var(--s-3) var(--s-4)' }}>
            {balances.isLoading ? <span className="skeleton" style={{ display: 'block', height: 80 }} /> : (balances.data ?? []).map((b) => (
              <Meter key={b.leaveTypeId} label={b.type} value={b.entitled ? (b.used / b.entitled) * 100 : 0} right={`${b.balance} of ${b.entitled} left`} tone={b.balance ? 'teal' : 'critical'} />
            ))}
          </div>
          {leave.error ? <ErrorState error={leave.error} onRetry={() => leave.refetch()} /> : (
            <DataTable compact rows={leave.data?.slice(0, 8)} loading={leave.isLoading} rowKey={(r) => r.id} emptyText="No leave requests."
              columns={[
                { key: 'code', label: 'Request', render: (r) => <><span className="t-bold">{r.leaveType}</span><div className="t-micro t-muted">{r.code}</div></> },
                { key: 'dates', label: 'Dates', render: (r) => `${fmt.dateShort(r.fromDate)}${r.toDate !== r.fromDate ? ` – ${fmt.dateShort(r.toDate)}` : ''} · ${r.days} d` },
                { key: 'status', label: 'Status', render: (r) => <><Status value={r.status} />{r.decisionNote && <div className="t-micro t-muted">{r.decisionNote}</div>}</> },
                { key: 'a', label: '', className: 'num', render: (r) => ['Submitted', 'Under Review'].includes(r.status) ? (
                  <Button size="sm" variant="quiet" loading={cancel.isPending && cancel.variables === r.id} onClick={async () => {
                    if (await confirm({ title: `Withdraw ${r.code}?`, body: 'The request is cancelled and HR no longer needs to review it.', confirmLabel: 'Withdraw', danger: true })) cancel.mutate(r.id);
                  }}>Withdraw</Button>
                ) : null },
              ]} />
          )}
        </Card>
        <Card title="My attendance" sub={attendance.data ? `${fmt.dateShort(attendance.data.from)} – ${fmt.dateShort(attendance.data.to)}` : undefined} flush>
          {attendance.data && (
            <div className="row g-2 wrap" style={{ padding: 'var(--s-3) var(--s-4)' }}>
              <Badge tone="success">{attendance.data.summary.present} present</Badge>
              <Badge tone="warning">{attendance.data.summary.late} late</Badge>
              <Badge tone="info">{attendance.data.summary.leave} leave</Badge>
              <Badge tone="critical">{attendance.data.summary.absent} absent</Badge>
            </div>
          )}
          {attendance.error ? <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} /> : (
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <DataTable compact rows={attendance.data?.rows} loading={attendance.isLoading} rowKey={(r) => r.date} emptyText="No attendance recorded."
                columns={[
                  { key: 'date', label: 'Date', render: (r) => `${fmt.dateShort(r.date)} · ${dayName(r.date).slice(0, 3)}` },
                  { key: 'in', label: 'In', render: (r) => r.checkIn ?? '—' },
                  { key: 'out', label: 'Out', render: (r) => r.checkOut ?? '—' },
                  { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
                ]} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid g-2col g-4 mt-4">
        <Card title="Overtime claims" id="my-overtime" flush actions={<Button size="sm" icon="plus" onClick={() => setClaiming(true)}>Claim</Button>}>
          {overtime.error ? <ErrorState error={overtime.error} onRetry={() => overtime.refetch()} /> : (
            <DataTable compact rows={overtime.data?.slice(0, 8)} loading={overtime.isLoading} rowKey={(r) => r.id} emptyText="No overtime claims."
              columns={[
                { key: 'date', label: 'Date', render: (r) => fmt.dateShort(r.workDate) },
                { key: 'hours', label: 'Hours', className: 'num', render: (r) => `${r.hours} h` },
                { key: 'reason', label: 'Reason', render: (r) => <span className="t-xs t-muted">{r.reason}</span> },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
              ]} />
          )}
        </Card>
        <Card title="My tasks" id="my-requests" flush>
          {tasks.error ? <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} /> : tasks.isLoading ? (
            <div style={{ padding: 16 }}><span className="skeleton" style={{ display: 'block', height: 120 }} /></div>
          ) : tasks.data?.length ? (
            <div>
              {tasks.data.map((t) => (
                <AlertItem key={t.id} tone={t.overdue ? 'critical' : t.priority === 'High' ? 'warning' : 'info'} icon="checkSquare"
                  title={t.title} meta={`${t.module} · ${t.dueOn ? `due ${fmt.date(t.dueOn)}` : 'no due date'}${t.overdue ? ' · overdue' : ''}`}
                  right={<Badge tone={t.priority === 'High' ? 'critical' : t.priority === 'Medium' ? 'warning' : 'neutral'}>{t.priority}</Badge>}
                  onClick={() => navigate('/my-tasks')} />
              ))}
            </div>
          ) : <Empty icon="check" title="No open tasks" sub="You are all caught up." />}
        </Card>
      </div>

      {applying && <LeaveApplyModal mode="self" onClose={() => setApplying(false)} />}
      {claiming && <ClaimModal onClose={() => setClaiming(false)} />}
    </Page>
  );
}

function ClaimModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ workDate: todayKey(), hours: '', reason: '' });
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const h = Number(f.hours);
  const errors: Record<string, string> = {};
  if (!f.workDate || f.workDate > todayKey()) errors.workDate = 'Choose a date up to today';
  else if (f.workDate < addDays(todayKey(), -60)) errors.workDate = 'Only the last 60 days can be claimed here';
  if (!(h > 0 && h <= 16 && Number.isInteger(h * 2))) errors.hours = 'Between 0.5 and 16, in half-hour steps';
  if (f.reason.trim().length < 3) errors.reason = 'Say what the extra hours covered';
  const save = useApiMutation<void>('post', '/me/overtime', {
    invalidate: ['/me'], success: 'Overtime claim submitted — awaiting approval', onSuccess: onClose,
    body: () => ({ workDate: f.workDate, hours: h, reason: f.reason.trim() }),
  });
  const server = fieldErrors(save.error);
  const err = (k: string) => (touched ? errors[k] : undefined) ?? server[k];
  return (
    <Modal open onClose={onClose} busy={save.isPending} title="Claim overtime" sub="Approved hours are paid in the next payroll run"
      foot={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => { setTouched(true); if (!Object.keys(errors).length) save.mutate(); }}>Submit claim</Button>
      </>}>
      {save.error && !Object.keys(server).length && <div className="mb-3"><InlineError error={save.error} /></div>}
      <div className="grid g-2col g-3">
        <TextField label="Date worked" type="date" required max={todayKey()} value={f.workDate} onChange={(v) => set('workDate', v)} error={err('workDate')} />
        <TextField label="Hours" type="number" required min={0.5} max={16} step={0.5} value={f.hours} onChange={(v) => set('hours', v)} error={err('hours')} />
      </div>
      <div className="mt-3"><TextArea label="Reason" required rows={3} value={f.reason} onChange={(v) => set('reason', v)} error={err('reason')} maxLength={300} /></div>
    </Modal>
  );
}
