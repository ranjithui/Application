import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiMutation, useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useLookups } from '@/hooks/useLookups';
import { fmt } from '@/lib/format';
import {
  Button, Card, DataTable, Dl, Empty, ErrorState, FilterSelect, Modal, Page, PageHead, PageSkeleton, Pagination,
  SearchInput, SelectField, Status, StudentLink, TextField,
} from '@/components/ui';
import type { Account, AccountRow } from './types';
import { fieldErrors, isMoney, Money, PaymentModal, ReceiptModal, StudentPicker, todayIso, useFinanceLookups } from './shared';

export default function StudentAccountsPage() {
  const [sp, setSp] = useSearchParams();
  const studentId = sp.get('student');
  const open = (id: string | null) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    if (id) n.set('student', id); else n.delete('student');
    return n;
  });
  return (
    <Page>
      <PageHead title="Student Accounts" sub="One ledger per student across tuition, transport, activities, trips, uniform, books and other charges." />
      {studentId ? <Ledger studentId={studentId} onBack={() => open(null)} onSwitch={open} /> : <AccountList onOpen={open} />}
    </Page>
  );
}

function AccountList({ onOpen }: { onOpen: (id: string) => void }) {
  const { campusParam } = useSchool();
  const { classOptions } = useLookups();
  const list = useListParams({ sort: 'name' }, ['feeStatus', 'classId']);
  const q = usePagedQuery<AccountRow>('/finance/accounts', { ...list.query, ...campusParam });
  return (
    <>
      <div className="filterbar">
        <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search a student by name or admission ID" />
        <FilterSelect label="Fees" value={list.filters.feeStatus} onChange={(v) => list.setFilter('feeStatus', v)} options={['Overdue', 'Partial', 'Pending', 'Paid']} />
        <FilterSelect label="Class" value={list.filters.classId} onChange={(v) => list.setFilter('classId', v)} options={classOptions(campusParam.campusId)} />
        {list.hasFilters && <Button size="sm" variant="quiet" onClick={list.clear}>Clear filters</Button>}
        <div className="spacer" />
        <span className="t-sm t-muted t-num">{q.data ? `${q.data.meta.total} accounts` : ''}</span>
      </div>
      <Card flush>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable rows={q.data?.rows} loading={q.isLoading || q.isPlaceholderData} rowKey={(r) => r.id}
            sort={list.sort} onSort={list.setSort} onRowClick={(r) => onOpen(r.id)}
            emptyText={list.hasFilters ? 'No accounts match the current filters.' : 'No student accounts yet.'}
            columns={[
              { key: 'name', label: 'Student', render: (r) => <StudentLink id={r.id} name={r.fullName} meta={r.admissionNo} /> },
              { key: 'grade', label: 'Grade', render: (r) => `${r.grade ?? '—'} ${r.section ?? ''} · ${r.campus}` },
              { key: 'billed', label: 'Billed', className: 'num', render: (r) => <Money v={r.billed} /> },
              { key: 'paid', label: 'Paid', className: 'num', render: (r) => <Money v={r.paid} /> },
              { key: 'balance', label: 'Balance', className: 'num', render: (r) => <Money v={r.balance} strong tone={r.balance ? 'critical' : 'muted'} /> },
              { key: 'overdue', label: 'Overdue', className: 'num', render: (r) => (r.overdue ? <Money v={r.overdue} tone="critical" /> : <span className="t-faint">—</span>) },
              { key: 'nextDue', label: 'Next due', sortable: false, render: (r) => fmt.date(r.nextDue) },
              { key: 'feeStatus', label: 'Status', render: (r) => <Status value={r.feeStatus} /> },
            ]} />
        )}
        <Pagination meta={q.data?.meta} onPage={list.setPage} onPageSize={list.setPageSize} />
      </Card>
    </>
  );
}

function Ledger({ studentId, onBack, onSwitch }: { studentId: string; onBack: () => void; onSwitch: (id: string) => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { campusParam } = useSchool();
  const q = useApiQuery<Account>(`/finance/accounts/${studentId}`);
  const [paying, setPaying] = useState(false);
  const [charging, setCharging] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  if (q.isLoading) return <PageSkeleton kpis={0} />;
  if (q.error || !q.data) return <><Button icon="arrowLeft" onClick={onBack}>All accounts</Button><div className="mt-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div></>;
  const a = q.data;
  const s = a.student;
  const approved = a.concessions.filter((c) => c.status === 'Approved');
  const pendingC = a.concessions.filter((c) => ['Submitted', 'Under Review'].includes(c.status));

  return (
    <>
      <div className="row between wrap g-3 mb-4">
        <Button icon="arrowLeft" onClick={onBack}>All accounts</Button>
        <div className="grow" style={{ maxWidth: 420 }}><StudentPicker onPick={(x) => onSwitch(x.id)} campusId={campusParam.campusId} placeholder="Open another student's ledger" /></div>
      </div>
      <div className="grid g-main">
        <Card title={`${s.fullName} · ${s.grade ?? ''}${s.section ?? ''}`} sub={`${s.admissionNo} · ${s.campus}${s.parentName ? ` · Parent: ${s.parentName}` : ''}`} flush
          actions={<>
            {can('finance.manage') && <Button size="sm" icon="plus" onClick={() => setCharging(true)}>Raise charge</Button>}
            <Button size="sm" icon="user" onClick={() => navigate(`/student-360/${s.id}`)}>Open Student 360</Button>
          </>}
          foot={
            <div className="row between wrap g-3">
              <span className="row g-4 wrap">
                <span>Billed <strong className="t-num">{fmt.money(a.summary.billed)}</strong></span>
                {a.summary.concession > 0 && <span>Concession <strong className="t-num">{fmt.money(a.summary.concession)}</strong></span>}
                <span>Paid <strong className="t-num">{fmt.money(a.summary.paid)}</strong></span>
                <span>Balance <strong className={`t-num ${a.summary.outstanding ? 't-critical' : ''}`}>{fmt.money(a.summary.outstanding)}</strong></span>
              </span>
              {can('finance.manage') && (
                <Button variant="teal" icon="creditCard" disabled={!a.summary.outstanding} onClick={() => setPaying(true)}>Take payment</Button>
              )}
            </div>
          }>
          <DataTable rows={a.lines} rowKey={(r) => r.id} emptyText="No charges have been raised for this student this year."
            columns={[
              { key: 'head', label: 'Charge', render: (r) => <><span className="t-bold">{r.description}</span><div className="t-micro t-muted">{r.head}</div></> },
              { key: 'due', label: 'Amount', className: 'num', render: (r) => <Money v={r.amountDue} /> },
              { key: 'concession', label: 'Concession', className: 'num', render: (r) => (r.concession ? <Money v={-r.concession} tone="success" /> : <span className="t-faint">—</span>) },
              { key: 'paid', label: 'Paid', className: 'num', render: (r) => <Money v={r.amountPaid} /> },
              { key: 'bal', label: 'Balance', className: 'num', render: (r) => <Money v={r.balance} strong tone={r.balance ? 'critical' : 'muted'} /> },
              { key: 'dueDate', label: 'Due date', render: (r) => fmt.date(r.dueDate) },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            ]} />
        </Card>
        <div className="col g-4">
          <Card title="Concession applied">
            {approved.length ? approved.map((c) => (
              <Dl key={c.id} items={[
                ['Type', c.type],
                ['Value', c.percent ? `${c.percent}% of tuition (${fmt.money(c.amount)})` : fmt.money(c.amount)],
                ['Approved by', c.approvedBy ?? '—'],
                ['Valid until', fmt.date(c.validUntil)],
              ]} />
            )) : <Empty icon="percent" title="No concession" sub={pendingC.length ? `${pendingC.length} request awaiting approval` : 'Full fees apply to this account.'}
              action={can('finance.manage') ? <Button size="sm" to="/concessions">Request a concession</Button> : undefined} />}
          </Card>
          <Card title="Payment history" flush>
            <DataTable compact rows={a.payments} rowKey={(r) => r.id} emptyText="No payments yet."
              columns={[
                { key: 'date', label: 'Date', render: (r) => fmt.date(r.paidAt) },
                { key: 'amount', label: 'Amount', className: 'num', render: (r) => <Money v={r.amount} strong /> },
                { key: 'method', label: 'Method', render: (r) => (r.status === 'Success' ? r.method : <Status value={r.status} />) },
                { key: 'a', label: '', className: 'num', render: (r) => r.status === 'Success' && <Button size="sm" icon="receipt" onClick={() => setReceipt(r.id)}>Receipt</Button> },
              ]} />
          </Card>
        </div>
      </div>
      <PaymentModal account={a} open={paying} onClose={() => setPaying(false)} onPaid={(id) => { setPaying(false); setReceipt(id); }} />
      <ChargeModal studentId={s.id} name={s.fullName} open={charging} onClose={() => setCharging(false)} />
      <ReceiptModal paymentId={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

function ChargeModal({ studentId, name, open, onClose }: { studentId: string; name: string; open: boolean; onClose: () => void }) {
  const lk = useFinanceLookups();
  const [f, setF] = useState({ feeHeadId: '', description: '', amount: '', dueDate: '' });
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF({ feeHeadId: '', description: '', amount: '', dueDate: '' }); setTouched(false); } }, [open]);
  const save = useApiMutation<Record<string, unknown>>('post', `/finance/accounts/${studentId}/charges`, { invalidate: ['/finance'], onSuccess: onClose });
  const errs: Record<string, string> = { ...fieldErrors(save.error) };
  if (touched) {
    if (!f.feeHeadId) errs.feeHeadId = 'Choose a fee head.';
    if (f.description.trim().length < 3) errs.description = 'Describe the charge.';
    if (!isMoney(f.amount)) errs.amount = 'Enter an amount greater than zero.';
    if (!f.dueDate) errs.dueDate = 'Choose a due date.';
  }
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} busy={save.isPending} title="Raise a charge" sub={`Adds a line to ${name}'s ledger and notifies the parent.`}
      foot={<>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => {
          setTouched(true);
          if (!f.feeHeadId || f.description.trim().length < 3 || !isMoney(f.amount) || !f.dueDate) return;
          save.mutate({ feeHeadId: f.feeHeadId, description: f.description.trim(), amount: Number(f.amount), dueDate: f.dueDate });
        }}>Raise charge</Button>
      </>}>
      <div className="col g-3">
        <SelectField label="Fee head" required value={f.feeHeadId} onChange={set('feeHeadId')} placeholder="Choose…"
          options={(lk.data?.feeHeads ?? []).map((h) => ({ value: h.id, label: h.name }))} error={errs.feeHeadId} />
        <TextField label="Description" required value={f.description} onChange={set('description')} maxLength={160} placeholder="e.g. Activities — Robotics Lab" error={errs.description} />
        <div className="grid g-2col">
          <TextField label="Amount (₹)" required type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} error={errs.amount} />
          <TextField label="Due date" required type="date" min={todayIso()} value={f.dueDate} onChange={set('dueDate')} error={errs.dueDate} />
        </div>
      </div>
    </Modal>
  );
}
