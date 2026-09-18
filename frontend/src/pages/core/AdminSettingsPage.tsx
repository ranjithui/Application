import { useState } from 'react';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { Badge, Button, Card, DataTable, ErrorState, Modal, Page, PageHead, TextArea } from '@/components/ui';
import { fmt } from '@/lib/format';

interface Setting { key: string; value: unknown; description: string | null; isPublic: boolean; updatedAt: string }

export default function AdminSettingsPage() {
  const q = useApiQuery<Setting[]>('/settings');
  const [edit, setEdit] = useState<Setting | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const save = useApiMutation<{ key: string; value: unknown }>('put', (v) => `/settings/${v.key}`, {
    invalidate: ['/settings'], body: (v) => ({ value: v.value }), success: 'Setting saved', onSuccess: () => setEdit(null),
  });
  const submit = () => {
    try {
      const value = JSON.parse(text);
      setErr('');
      save.mutate({ key: edit!.key, value });
    } catch {
      setErr('Enter valid JSON, e.g. "text", 30, true or ["a","b"]');
    }
  };
  return (
    <Page>
      <PageHead title="System settings" sub="School-wide configuration. Public settings are visible on the sign-in screen." />
      <Card flush>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable rows={q.data} loading={q.isLoading} rowKey={(r) => r.key}
            columns={[
              { key: 'key', label: 'Setting', render: (r) => <><span className="t-bold coord">{r.key}</span><div className="t-micro t-muted">{r.description}</div></> },
              { key: 'value', label: 'Value', render: (r) => <code className="t-xs">{JSON.stringify(r.value)}</code> },
              { key: 'public', label: 'Visibility', render: (r) => <Badge tone={r.isPublic ? 'info' : 'neutral'}>{r.isPublic ? 'Public' : 'Internal'}</Badge> },
              { key: 'updated', label: 'Updated', render: (r) => fmt.dateTime(r.updatedAt) },
              { key: 'edit', label: '', className: 'num', render: (r) => <Button size="sm" icon="edit" onClick={() => { setEdit(r); setText(JSON.stringify(r.value)); setErr(''); }}>Edit</Button> },
            ]} />
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.key ?? ''} sub={edit?.description ?? undefined} busy={save.isPending}
        foot={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
        <TextArea label="Value (JSON)" value={text} onChange={setText} rows={4} error={err} />
      </Modal>
    </Page>
  );
}
