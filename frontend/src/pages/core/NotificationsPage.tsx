import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useApiMutation, useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { AlertItem, Badge, Banner, Button, Card, Chips, Empty, ErrorState, Page, PageHead, Pagination, Skeleton } from '@/components/ui';
import type { NotificationItem } from '@/api/types';
import { fmt } from '@/lib/format';

const TONE: Record<string, string> = { Critical: 'critical', Attention: 'warning', Information: 'info', Completed: 'success' };

const SCOPE: Record<string, string> = {
  family: 'Your own children only. You never see another family’s information.',
  class: 'Your classes and your students only.',
  self: 'Your own shifts, leave, pay and the duties assigned to you.',
  school: 'Everything within your remit across the campus.',
};

interface Counts { unread: number; critical: number; attention: number; information: number; completed: number; total: number }

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useListParams({ pageSize: 25 }, ['category', 'unread']);
  const q = usePagedQuery<NotificationItem>('/notifications', { ...list.query, sort: undefined, dir: undefined });
  const counts = useApiQuery<Counts>('/notifications/counts');
  const markRead = useApiMutation<string>('patch', (id) => `/notifications/${id}/read`, { invalidate: ['/notifications'], success: false, error: false });
  const markAll = useApiMutation('post', '/notifications/read-all', { invalidate: ['/notifications'], success: 'All notifications marked read' });

  const c = counts.data;
  const cat = list.filters.category || 'All';

  const open = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.route) navigate(n.route);
  };

  return (
    <Page>
      <PageHead
        title="Notification Center"
        sub={`Categories map to how quickly somebody must act. ${SCOPE[user?.role.scope ?? 'school']}`}
        actions={
          <>
            <Button icon="check" onClick={() => markAll.mutate({})} loading={markAll.isPending} disabled={!c?.unread}>Mark all read</Button>
            <Button icon="settings" to="/account?tab=notifications">Notification settings</Button>
          </>
        }
      />
      <div className="mb-4">
        <Banner tone="neutral" icon="lock">
          Showing the <strong>{user?.role.name}</strong> queue, signed in as {user?.fullName}. Notifications are filtered by role and data scope, so nothing outside your remit appears here.
        </Banner>
      </div>
      <div className="filterbar">
        <Chips
          items={[
            { id: 'All', label: 'All', count: c?.total },
            { id: 'Critical', label: 'Critical', count: c?.critical, tone: 'critical' },
            { id: 'Attention', label: 'Attention', count: c?.attention, tone: 'warning' },
            { id: 'Information', label: 'Information', count: c?.information, tone: 'info' },
            { id: 'Completed', label: 'Completed', count: c?.completed, tone: 'success' },
          ]}
          active={cat}
          onChange={(v) => list.setFilter('category', v === 'All' ? '' : v)}
        />
        <div className="spacer" />
        <label className="check">
          <input type="checkbox" checked={list.filters.unread === 'true'} onChange={(e) => list.setFilter('unread', e.target.checked ? 'true' : '')} />
          Unread only {c ? `(${c.unread})` : ''}
        </label>
      </div>
      <Card flush>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <div className="card__body col g-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}</div>
        ) : q.data?.rows.length ? (
          <div>
            {q.data.rows.map((n) => (
              <AlertItem
                key={n.id}
                tone={n.tone}
                icon={n.icon}
                title={<>{!n.readAt && <span className="dot dot--info" style={{ display: 'inline-block', marginRight: 8 }} aria-label="Unread" />}{n.title}</>}
                meta={`${n.body ? `${n.body} · ` : ''}${fmt.relative(n.createdAt)}`}
                onClick={() => open(n)}
                right={<Badge tone={TONE[n.category]}>{n.category}</Badge>}
              />
            ))}
          </div>
        ) : (
          <Empty title="Nothing in this category" sub="Switch category to see other notifications." icon="bell" />
        )}
        <Pagination meta={q.data?.meta} onPage={list.setPage} />
      </Card>
    </Page>
  );
}
