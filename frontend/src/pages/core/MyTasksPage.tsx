import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useApiMutation, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { Badge, Banner, Button, Card, DataTable, ErrorState, Flow, Modal, Page, PageHead, Pagination, Segment, Status } from '@/components/ui';
import type { TaskItem } from '@/api/types';
import { fmt } from '@/lib/format';

export default function MyTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState(false);
  const list = useListParams({ pageSize: 25 }, ['status']);
  const status = list.filters.status || 'open';
  const q = usePagedQuery<TaskItem>('/tasks', { page: list.page, pageSize: list.pageSize, status, q: list.q || undefined });
  const update = useApiMutation<{ id: string; status: string }>('patch', (v) => `/tasks/${v.id}`, {
    invalidate: ['/tasks', '/notifications/counts'],
    body: (v) => ({ status: v.status }),
    success: (_r, v) => (v.status === 'Completed' ? 'Task marked complete' : 'Task reopened'),
  });
  const isFamily = user?.role.scope === 'family';
  const rows = q.data?.rows ?? [];
  const underReview = rows.filter((r) => r.status === 'Under Review').length;

  return (
    <Page>
      <PageHead
        title="My Tasks"
        sub={`${isFamily ? 'Things the school needs from you.' : `Approvals and actions assigned to ${user?.fullName}.`} Each one carries the standard status states.`}
        actions={<Button icon="shield" onClick={() => setPolicy(true)}>{isFamily ? 'How this works' : 'Approval policy'}</Button>}
      />
      <Card>
        {isFamily ? (
          <Banner tone="neutral" icon="lock">These are your own actions as a parent. Approvals, payroll, compliance and staff matters belong to school administration and never appear here.</Banner>
        ) : (
          <>
            <Flow steps={[
              { label: 'Draft', meta: 'Created, not submitted', state: 'done' },
              { label: 'Submitted', meta: 'Waiting for reviewer', state: 'done' },
              { label: 'Under Review', meta: `${underReview} item${underReview === 1 ? '' : 's'} here now`, state: 'active' },
              { label: 'Approved', meta: 'Actioned and logged' },
              { label: 'Rejected', meta: 'Returned with a reason' },
            ]} />
            <p className="t-xs t-muted mt-3">Leave, payroll, expenses, reimbursements, certificates, admission offers, parent communication and AI-generated content all follow this same path.</p>
          </>
        )}
      </Card>
      <div className="mt-4">
        <Card
          title={status === 'Completed' ? 'Completed items' : 'Open items'}
          sub={`${q.data?.meta.total ?? 0} ${status === 'Completed' ? 'completed' : 'assigned to you'}`}
          actions={<Segment items={[{ id: 'open', label: 'Open' }, { id: 'Completed', label: 'Completed' }]} active={status} onChange={(v) => list.setFilter('status', v === 'open' ? '' : v)} />}
          flush
        >
          {q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <DataTable
              rows={rows}
              loading={q.isLoading}
              rowKey={(r) => r.id}
              onRowClick={(r) => r.route && navigate(r.route)}
              emptyText={status === 'Completed' ? 'Nothing completed yet.' : 'Nothing is assigned to you right now.'}
              columns={[
                {
                  key: 'title', label: 'Task', render: (r) => (
                    <div className="row g-3">
                      <input
                        type="checkbox"
                        checked={r.status === 'Completed'}
                        aria-label={`Complete ${r.title}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => update.mutate({ id: r.id, status: e.target.checked ? 'Completed' : 'Pending' })}
                        disabled={update.isPending}
                      />
                      <span className="col">
                        <span className="t-sm t-bold" style={r.status === 'Completed' ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>{r.title}</span>
                        <span className="t-micro t-muted">{r.code} · {r.module}</span>
                      </span>
                    </div>
                  ),
                },
                { key: 'due', label: 'Due', render: (r) => (r.overdue && r.status !== 'Completed' ? <Badge tone="critical">Overdue · {fmt.dateShort(r.dueOn)}</Badge> : fmt.dateShort(r.dueOn)) },
                { key: 'priority', label: 'Priority', render: (r) => <Badge tone={r.priority === 'High' ? 'critical' : r.priority === 'Medium' ? 'warning' : 'neutral'}>{r.priority}</Badge> },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
                { key: 'go', label: '', className: 'num', render: (r) => (r.route ? <Button size="sm" iconRight="chevronRight" to={r.route} onClick={(e) => e.stopPropagation()}>Open</Button> : null) },
              ]}
            />
          )}
          <Pagination meta={q.data?.meta} onPage={list.setPage} />
        </Card>
      </div>

      <Modal open={policy} onClose={() => setPolicy(false)} title="Approval and workflow design" size="wide" foot={<Button variant="primary" onClick={() => setPolicy(false)}>Close</Button>}>
        <p className="t-sm t-muted">Anywhere an action needs authorisation, the same states are used, with the same badges, so staff learn the pattern once.</p>
        <div className="mt-4">
          <Flow steps={[
            { label: 'Draft', meta: 'Editable by the author', state: 'done' },
            { label: 'Submitted', meta: 'Locked, queued for review', state: 'done' },
            { label: 'Under Review', meta: 'Reviewer can request changes', state: 'active' },
            { label: 'Approved / Rejected', meta: 'Outcome recorded in the audit trail' },
          ]} />
        </div>
        <div className="grid g-2col g-3 mt-5">
          {[
            ['Leave', 'Line manager, then HR if over 3 days'], ['Payroll', 'Prepared by HR, approved by a different authorised user'],
            ['Expense', 'Budget owner, then Finance'], ['Reimbursement', 'Line manager, then Finance'],
            ['Certificate', 'Front office, then Principal'], ['Admission offer', 'Counsellor, then Head of Admissions'],
            ['Parent communication', 'Class teacher, then Section head'], ['AI-generated content', 'Always a named human reviewer'],
          ].map(([k, v]) => (
            <div key={k} className="card card--tint" style={{ padding: '12px 14px' }}>
              <div className="t-sm t-bold">{k}</div>
              <div className="t-micro t-muted">{v}</div>
            </div>
          ))}
        </div>
      </Modal>
    </Page>
  );
}
