import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, Chips, DataTable, Empty, ErrorState, FilterSelect, Page, PageHead, Pagination,
  SearchInput, Segment, Skeleton, StatStrip, Status, StudentLink, TextArea, useConfirm,
} from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, useApiQuery, usePagedQuery } from '@/hooks/useApi';
import { useListParams } from '@/hooks/useListParams';
import { useSchool } from '@/layouts/SchoolContext';
import { useAuth } from '@/auth/AuthContext';
import { cx, fmt } from '@/lib/format';
import { ChannelBadge, LogInteractionModal, SendMessageModal, ageLabel } from './shared';
import type { CommSummary, Communication, ThreadDetail, ThreadRow } from './types';

type Pane = { kind: 'item'; id: string } | { kind: 'thread'; id: string } | null;

export default function ParentCommunicationPage() {
  const { can } = useAuth();
  const { campusParam } = useSchool();
  const [sp, setSp] = useSearchParams();
  const list = useListParams({ sort: 'occurredAt', dir: 'desc', pageSize: 10 }, ['channel', 'direction']);
  const [side, setSide] = useState<'queue' | 'threads'>(sp.get('thread') ? 'threads' : 'queue');
  const [newMsg, setNewMsg] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const pane: Pane = sp.get('thread') ? { kind: 'thread', id: sp.get('thread')! } : sp.get('item') ? { kind: 'item', id: sp.get('item')! } : null;
  const select = (p: Pane) => setSp((prev) => {
    const next = new URLSearchParams(prev);
    next.delete('thread'); next.delete('item');
    if (p) next.set(p.kind === 'thread' ? 'thread' : 'item', p.id);
    return next;
  }, { replace: true });

  const summary = useApiQuery<CommSummary>('/communications/summary', campusParam);
  const queue = usePagedQuery<Communication>('/communications', { needsReply: true, sort: 'occurredAt', dir: 'asc', pageSize: 50, ...campusParam });
  const threads = usePagedQuery<ThreadRow>('/communication/threads', { pageSize: 50 });
  const history = usePagedQuery<Communication>('/communications', { ...list.query, ...campusParam });

  // Default to the oldest unanswered message.
  useEffect(() => {
    if (!pane && side === 'queue' && queue.data?.rows.length) select({ kind: 'item', id: queue.data.rows[0].id });
    if (!pane && side === 'threads' && threads.data?.rows.length) select({ kind: 'thread', id: threads.data.rows[0].id });
  }, [queue.data, threads.data, side]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = summary.data;
  const channels = ['WhatsApp', 'Email', 'SMS', 'Call', 'Note', 'In-app'];

  return (
    <Page>
      <PageHead
        title="Parent Communication"
        sub="Every channel in one thread per family. Outbound messages are recorded against the family and delivered through the school’s notification outbox."
        actions={<>
          {can('communication.send') && <Button icon="megaphone" to="/circulars">Broadcast</Button>}
          {can('communication.send') && <Button icon="phone" onClick={() => setLogOpen(true)}>Log call or note</Button>}
          {can('communication.send') && <Button variant="primary" icon="plus" onClick={() => setNewMsg(true)}>New message</Button>}
        </>}
      />
      {summary.error ? <ErrorState error={summary.error} onRetry={summary.refetch} /> : (
        <StatStrip items={[
          { label: 'Awaiting reply', value: summary.isLoading ? '…' : fmt.n(s?.unanswered) },
          { label: 'Over 24 hours', value: summary.isLoading ? '…' : <span className={s?.unansweredOver24h ? 't-critical' : ''}>{fmt.n(s?.unansweredOver24h)}</span> },
          { label: 'Oldest waiting', value: summary.isLoading ? '…' : s?.unanswered ? ageLabel(s.oldestHours) : '—' },
          { label: 'Interactions today', value: summary.isLoading ? '…' : fmt.n(s?.today) },
          { label: 'Last 30 days', value: summary.isLoading ? '…' : fmt.n(s?.last30Days) },
          { label: 'Unread conversations', value: summary.isLoading ? '…' : fmt.n(s?.unreadThreads) },
        ]} />
      )}

      <div className="grid g-side mt-4">
        <Card
          flush
          title="Open threads"
          sub={s ? `${fmt.n(s.unansweredOver24h)} unanswered over 24 hours` : ' '}
          actions={<Segment items={[{ id: 'queue', label: `Unanswered${queue.data ? ` (${queue.data.meta.total})` : ''}` }, { id: 'threads', label: 'App' }]}
            active={side} onChange={(v) => { setSide(v); select(null); }} />}
        >
          {side === 'queue' ? (
            queue.error ? <ErrorState error={queue.error} onRetry={queue.refetch} />
              : queue.isLoading ? <div className="card__body col g-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} />)}</div>
                : !queue.data?.rows.length ? <Empty icon="checkSquare" title="Nothing waiting" sub="Every parent message has been answered." />
                  : <div>{queue.data.rows.map((c) => (
                    <button key={c.id} type="button"
                      className={`alert-item alert-item--${(c.ageHours ?? 0) >= 24 ? 'critical' : (c.ageHours ?? 0) >= 12 ? 'warning' : 'info'}`}
                      style={pane?.kind === 'item' && pane.id === c.id ? { background: 'var(--surface-alt)' } : undefined}
                      aria-current={pane?.kind === 'item' && pane.id === c.id}
                      onClick={() => select({ kind: 'item', id: c.id })}>
                      <Avatar name={c.counterpart} size="sm" />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="alert-item__title" style={{ display: 'block' }}>{c.counterpart}</span>
                        <span className="alert-item__meta t-clip" style={{ display: 'block' }}>{c.channel} · {c.subject}{c.studentName ? ` · ${c.studentName}${c.grade ? ` (${c.grade.replace('Grade ', '')})` : ''}` : ''}</span>
                      </span>
                      <span className="t-micro t-muted none">{ageLabel(c.ageHours)}</span>
                    </button>
                  ))}</div>
          ) : (
            threads.error ? <ErrorState error={threads.error} onRetry={threads.refetch} />
              : threads.isLoading ? <div className="card__body col g-2">{[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}</div>
                : !threads.data?.rows.length ? <Empty icon="message" title="No app conversations" sub="Messages parents send from the app appear here." />
                  : <div>{threads.data.rows.map((t) => (
                    <button key={t.id} type="button"
                      className={`alert-item alert-item--${t.status === 'Closed' ? 'success' : t.awaitingReply ? 'warning' : 'info'}`}
                      style={pane?.kind === 'thread' && pane.id === t.id ? { background: 'var(--surface-alt)' } : undefined}
                      aria-current={pane?.kind === 'thread' && pane.id === t.id}
                      onClick={() => select({ kind: 'thread', id: t.id })}>
                      <Avatar name={t.parentName ?? t.subject} size="sm" />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="alert-item__title" style={{ display: 'block' }}>
                          {t.parentName ?? 'Conversation'}
                          {t.unread && <span className="dot dot--critical" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 6 }} aria-label="Unread" />}
                        </span>
                        <span className="alert-item__meta t-clip" style={{ display: 'block' }}>{t.subject}{t.studentName ? ` · ${t.studentName}` : ''}</span>
                      </span>
                      <span className="t-micro t-muted none">{fmt.relative(t.lastMessageAt)}</span>
                    </button>
                  ))}</div>
          )}
        </Card>

        {pane?.kind === 'thread' ? <ThreadPane id={pane.id} />
          : pane?.kind === 'item' ? <ItemPane id={pane.id} onOpenThread={(id) => { setSide('threads'); select({ kind: 'thread', id }); }} onDone={() => select(null)} />
            : <Card><Empty icon="message" title="Choose a conversation" sub="Select an unanswered message or an app conversation to read and reply." /></Card>}
      </div>

      <Card flush title="Communication history" sub="WhatsApp, email, SMS, calls, notes and app messages in one record" className="mt-4">
        <div className="toolbar">
          <SearchInput value={list.q} onSearch={list.setQ} placeholder="Search subject, family or message" />
          <FilterSelect label="Direction" value={list.filters.direction} onChange={(v) => list.setFilter('direction', v)}
            options={[{ value: 'inbound', label: 'From families' }, { value: 'outbound', label: 'From school' }, { value: 'internal', label: 'Internal notes' }]} />
        </div>
        <div style={{ padding: '0 var(--s-4) var(--s-3)' }}>
          <Chips items={[{ id: '', label: 'All channels' }, ...channels.map((c) => ({ id: c, label: c, count: s?.byChannel[c] }))]}
            active={list.filters.channel} onChange={(v) => list.setFilter('channel', v)} />
        </div>
        {history.error ? <ErrorState error={history.error} onRetry={history.refetch} /> : (
          <DataTable<Communication>
            rows={history.data?.rows}
            loading={history.isLoading || history.isFetching}
            rowKey={(r) => r.id}
            sort={list.sort}
            onSort={list.setSort}
            emptyText="No interactions match the current filters."
            columns={[
              { key: 'channel', label: 'Channel', render: (r) => <ChannelBadge channel={r.channel} /> },
              {
                key: 'parent', label: 'With', render: (r) => (
                  <span className="col">
                    <span className="t-sm t-bold">{r.counterpart}{r.recipients > 1 ? <span className="t-muted t-xs"> · {fmt.n(r.recipients)} recipients</span> : null}</span>
                    {r.studentId && r.studentName ? <StudentLink id={r.studentId} name={r.studentName} meta={r.grade ?? undefined} /> : null}
                  </span>
                ),
              },
              {
                key: 'subject', label: 'Subject', render: (r) => (
                  <span className="col" style={{ maxWidth: 360 }}>
                    <span className="t-sm">{r.direction === 'inbound' ? '← ' : r.direction === 'outbound' ? '→ ' : ''}{r.subject}</span>
                    {r.body && <span className="t-micro t-muted t-clip">{r.body}</span>}
                  </span>
                ),
              },
              { key: 'occurredAt', label: 'When', render: (r) => <span className="t-sm" title={fmt.dateTime(r.occurredAt)}>{fmt.relative(r.occurredAt)}</span> },
              {
                key: 'status', label: 'Status', render: (r) => r.needsReply ? <Badge tone="critical" dot>Awaiting reply</Badge>
                  : <Status value={r.status.startsWith('Delivered') ? 'Delivered' : r.status} label={r.status} />,
              },
              { key: 'by', label: 'By', sortable: false, render: (r) => <span className="t-xs t-muted">{r.direction === 'inbound' ? (r.repliedBy ? `Replied by ${r.repliedBy}` : 'Family') : r.sentBy ?? 'System'}</span> },
              {
                key: 'a', label: '', sortable: false, className: 'num', render: (r) => r.needsReply ? (
                  <Button size="sm" onClick={() => { setSide('queue'); select({ kind: 'item', id: r.id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Open</Button>
                ) : r.threadId ? (
                  <Button size="sm" variant="quiet" onClick={() => { setSide('threads'); select({ kind: 'thread', id: r.threadId! }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Conversation</Button>
                ) : null,
              },
            ]}
          />
        )}
        <Pagination meta={history.data?.meta} onPage={list.setPage} onPageSize={list.setPageSize} />
      </Card>

      <SendMessageModal open={newMsg} onClose={() => setNewMsg(false)} />
      <LogInteractionModal open={logOpen} onClose={() => setLogOpen(false)} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// A message from the unanswered queue, shown with the family's recent history
// ---------------------------------------------------------------------------
function ItemPane({ id, onOpenThread, onDone }: { id: string; onOpenThread: (threadId: string) => void; onDone: () => void }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [channel, setChannel] = useState('WhatsApp');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [compose, setCompose] = useState(false);
  const { campusParam } = useSchool();
  const queue = usePagedQuery<Communication>('/communications', { needsReply: true, sort: 'occurredAt', dir: 'asc', pageSize: 50, ...campusParam });
  const fromQueue = queue.data?.rows.find((c) => c.id === id);
  const historyQ = usePagedQuery<Communication>(fromQueue?.parentId ? '/communications' : null, { parentId: fromQueue?.parentId ?? undefined, pageSize: 20, sort: 'occurredAt', dir: 'desc' });
  const item = fromQueue ?? historyQ.data?.rows.find((c) => c.id === id);
  const items = useMemo(() => [...(historyQ.data?.rows ?? [])].reverse(), [historyQ.data]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [items.length]);
  useEffect(() => {
    setText(''); setError('');
    if (fromQueue) setChannel(['WhatsApp', 'Email', 'SMS', 'In-app'].includes(fromQueue.channel) ? fromQueue.channel : 'WhatsApp');
  }, [id, fromQueue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useApiMutation<Record<string, unknown>>('post', '/communications/send', {
    invalidate: ['/communications', '/parent-directory'], onSuccess: () => { setText(''); onDone(); },
  });
  const replied = useApiMutation<string>('post', (cid) => `/communications/${cid}/replied`, {
    invalidate: ['/communications'], success: 'Marked as replied', onSuccess: () => onDone(),
  });

  if (queue.isLoading) return <Card><Skeleton height={220} /></Card>;
  if (queue.error) return <ErrorState error={queue.error} onRetry={queue.refetch} />;
  if (!item) return <Card><Empty icon="checkSquare" title="This message has been answered" sub="Choose another conversation from the list." /></Card>;

  const submit = () => {
    if (text.trim().length < 2) { setError('Write a reply before sending'); return; }
    if (item.threadId) return;
    send.mutate({
      parentId: item.parentId, studentId: item.studentId ?? undefined, channel,
      subject: item.subject.startsWith('Re: ') ? item.subject : `Re: ${item.subject}`, body: text.trim(), replyTo: item.id,
    });
  };

  const markReplied = async () => {
    const okk = await confirm({ title: 'Mark as replied?', body: 'Use this when the family was answered outside the system, for example in person or by phone. It will leave the unanswered queue.', confirmLabel: 'Mark replied' });
    if (okk) replied.mutate(item.id);
  };

  return (
    <Card
      title={item.counterpart}
      sub={`${item.studentName ? `${item.studentName}${item.grade ? ` (${item.grade.replace('Grade ', '')})` : ''} · ` : ''}${item.subject}`}
      actions={<>
        {item.studentId && <Button size="sm" icon="user" to={`/student-360/${item.studentId}`}>Open Student 360</Button>}
        {item.parentId && <Button size="sm" variant="quiet" icon="users" to={`/parent-directory?parent=${item.parentId}`}>Family</Button>}
      </>}
    >
      {historyQ.isLoading ? <Skeleton height={180} /> : historyQ.error ? <ErrorState error={historyQ.error} onRetry={historyQ.refetch} /> : (
        <div className="chat" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
          {items.length === 0 && <p className="t-sm t-muted">No earlier interactions with this family.</p>}
          {items.map((c) => (
            <div key={c.id} className={cx('bubble', c.direction === 'inbound' ? 'bubble--in' : c.direction === 'internal' ? 'bubble--ai' : 'bubble--out')}
              style={c.id === item.id ? { boxShadow: '0 0 0 2px var(--warning)' } : undefined}>
              {c.direction === 'internal' && <strong>Note · </strong>}
              {c.body ?? c.subject}
              <div className="bubble__meta" style={c.direction === 'outbound' ? { color: 'rgba(255,255,255,.75)' } : undefined}>
                {c.channel} · {fmt.dateTime(c.occurredAt)}
                {c.direction !== 'inbound' && c.sentBy ? ` · ${c.sentBy}` : ''}
                {c.direction === 'outbound' ? ` · ${c.status.toLowerCase()}` : ''}
                {c.needsReply ? ' · awaiting reply' : ''}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      <div className="divider" />
      {!can('communication.send') ? (
        <p className="t-sm t-muted">You can read this conversation. Replies need the “send messages” permission.</p>
      ) : item.threadId ? (
        <div className="row between wrap g-2">
          <span className="t-sm t-muted">This message came from the parent app. Reply inside the conversation so the family sees it in the app.</span>
          <Button variant="primary" size="sm" icon="message" onClick={() => onOpenThread(item.threadId!)}>Open conversation</Button>
        </div>
      ) : !item.parentId ? (
        <div className="row between wrap g-2">
          <span className="t-sm t-muted">No family is linked to this item.</span>
          <Button size="sm" onClick={markReplied} loading={replied.isPending}>Mark done</Button>
        </div>
      ) : (
        <>
          <TextArea label="Reply" rows={3} value={text} onChange={(v) => { setText(v); setError(''); }} error={error} maxLength={2000}
            placeholder="Write a reply. It is sent from the school account and recorded here." />
          {!item.parentHasApp && <p className="t-micro t-muted mt-1">This family has no app account; the reply is recorded but cannot be delivered. Consider calling instead.</p>}
          <div className="row between wrap g-2 mt-3">
            <div className="row g-2">
              <FilterSelect label="Reply channel" allLabel={null} value={channel} onChange={setChannel} options={['WhatsApp', 'SMS', 'Email', 'In-app']} />
              <Button size="sm" onClick={() => setCompose(true)}>Full editor</Button>
            </div>
            <div className="row g-2">
              <Button size="sm" onClick={markReplied} loading={replied.isPending}>Mark replied</Button>
              <Button size="sm" variant="primary" icon="send" onClick={submit} loading={send.isPending}>Send</Button>
            </div>
          </div>
        </>
      )}
      <SendMessageModal open={compose} onClose={() => setCompose(false)} replyTo={item} onSent={() => onDone()} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// App conversation
// ---------------------------------------------------------------------------
function ThreadPane({ id }: { id: string }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const t = useApiQuery<ThreadDetail>(`/communication/threads/${id}`);
  const endRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useEffect(() => { setText(''); setError(''); }, [id]);
  // Opening a conversation marks it read: refresh the unread markers.
  useEffect(() => {
    if (!t.data?.id) return;
    void qc.invalidateQueries({ queryKey: ['/communication/threads'] });
    void qc.invalidateQueries({ queryKey: ['/communications/summary'] });
  }, [t.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [t.data?.messages.length]);
  const reply = useApiMutation<{ body: string }>('post', `/communication/threads/${id}/reply`, {
    invalidate: ['/communication', '/communications'], success: 'Reply sent', onSuccess: () => setText(''),
  });
  const status = useApiMutation<'close' | 'reopen'>('post', (a) => `/communication/threads/${id}/${a}`, {
    invalidate: ['/communication', '/communications'], body: () => ({}),
  });

  if (t.isLoading) return <Card><Skeleton height={260} /></Card>;
  if (t.error) return <ErrorState error={t.error} onRetry={t.refetch} />;
  const d = t.data!;
  const staff = d.participants.filter((p) => p.role !== 'parent').map((p) => p.name).join(', ');

  const submit = () => {
    if (!text.trim()) { setError('Write a reply before sending'); return; }
    reply.mutate({ body: text.trim() });
  };
  const close = async () => {
    if (await confirm({ title: 'Close this conversation?', body: 'The family can still read it, but cannot reply until it is reopened.', confirmLabel: 'Close conversation' })) status.mutate('close');
  };

  return (
    <Card
      title={d.parentName ?? d.subject}
      sub={<>{d.studentName ? `${d.studentName}${d.grade ? ` (${d.grade.replace('Grade ', '')})` : ''} · ` : ''}{d.subject} · with {staff || 'school staff'} <Status value={d.status} /></>}
      actions={<>
        {d.studentId && <Button size="sm" icon="user" to={`/student-360/${d.studentId}`}>Open Student 360</Button>}
        {can('communication.send') && (d.status === 'Open'
          ? <Button size="sm" variant="quiet" onClick={close} loading={status.isPending}>Close</Button>
          : <Button size="sm" variant="quiet" onClick={() => status.mutate('reopen')} loading={status.isPending}>Reopen</Button>)}
      </>}
    >
      <div className="chat" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
        {d.messages.map((m) => (
          <div key={m.id} className={cx('bubble', m.mine ? 'bubble--out' : m.senderRole === 'parent' ? 'bubble--in' : 'bubble--ai')}>
            {m.body}
            <div className="bubble__meta" style={m.mine ? { color: 'rgba(255,255,255,.75)' } : undefined}>
              {m.mine ? 'You' : m.senderName} · App · {fmt.dateTime(m.createdAt)}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="divider" />
      {can('communication.send') ? (
        <>
          <TextArea label="Reply" rows={3} value={text} onChange={(v) => { setText(v); setError(''); }} error={error} maxLength={2000}
            placeholder={d.status === 'Closed' ? 'Replying reopens the conversation.' : 'Write a reply. The family is notified in the app.'} />
          <div className="row between wrap g-2 mt-3">
            <span className="t-micro t-muted">{d.messageCount} messages · last {fmt.relative(d.lastMessageAt)}</span>
            <Button size="sm" variant="primary" icon="send" onClick={submit} loading={reply.isPending}>Send</Button>
          </div>
        </>
      ) : <p className="t-sm t-muted">You can read this conversation. Replies need the “send messages” permission.</p>}
    </Card>
  );
}
