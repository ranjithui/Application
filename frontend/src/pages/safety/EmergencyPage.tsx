import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { useApiMutation, useApiQuery, usePagedQuery } from '@/hooks/useApi';
import {
  Badge, Banner, Button, Card, Checkbox, DataTable, ErrorState, Page, PageHead, Pagination, SelectField, Skeleton, Status, TextArea, useConfirm,
} from '@/components/ui';
import { fmt } from '@/lib/format';
import { FormModal, SAFETY_KEYS, useFieldErrors } from './shared';
import type { Broadcast, Incident } from './types';

interface AudienceRow { key: string; label: string; count: number }

const TYPES = [
  { value: 'Emergency', label: 'Emergency' },
  { value: 'Drill', label: 'Drill (clearly labelled)' },
  { value: 'Urgent operational notice', label: 'Urgent operational notice' },
  { value: 'Lockdown', label: 'Lockdown' },
  { value: 'Evacuation', label: 'Evacuation' },
  { value: 'Weather', label: 'Weather' },
  { value: 'Transport', label: 'Transport' },
];
const CHANNELS = ['App + WhatsApp + SMS', 'App + WhatsApp', 'SMS only'];
const typeTone = (t: string) => (t === 'Drill' ? 'info' : ['Emergency', 'Lockdown', 'Evacuation'].includes(t) ? 'critical' : 'neutral');

export default function EmergencyPage() {
  const { can } = useAuth();
  const { campusParam } = useSchool();
  const canSend = can(['notifications.broadcast', 'safety.manage']);
  const audience = useApiQuery<AudienceRow[]>('/emergency/audience', campusParam);
  const [page, setPage] = useState(1);
  const history = usePagedQuery<Broadcast>('/emergency/broadcasts', { page, pageSize: 8, ...campusParam });
  const incidents = usePagedQuery<Incident>('/incidents', { pageSize: 8, sort: 'date', dir: 'desc', ...campusParam });
  const [compose, setCompose] = useState<string | null>(null);
  const total = (audience.data ?? []).reduce((a, x) => a + x.count, 0);

  return (
    <Page>
      <PageHead title="Emergency Alerts" sub="One action reaches every audience at once. Every broadcast is logged with who sent it and why." />
      <Card className="card--navy">
        <div className="row-top g-5 wrap">
          <div className="grow" style={{ minWidth: 260 }}>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>Immediate broadcast</div>
            <h2 className="h1 mt-2" style={{ color: '#fff' }}>Emergency broadcast</h2>
            <p className="t-sm mt-2" style={{ color: 'var(--text-on-navy)', opacity: .85, maxWidth: '52ch' }}>
              Reaches parents, teachers, staff and management simultaneously across the app, WhatsApp and SMS. Use only for genuine emergencies. Every use is audited.
            </p>
            {canSend ? (
              <div className="row g-3 mt-4 wrap">
                <Button variant="danger" size="lg" icon="megaphone" onClick={() => setCompose('Emergency')}>Compose broadcast</Button>
                <Button variant="onnavy" size="lg" icon="shield" onClick={() => setCompose('Drill')}>Run a drill instead</Button>
              </div>
            ) : (
              <p className="t-sm mt-4" style={{ color: '#fff' }}>You can view the history. Sending requires emergency broadcast rights.</p>
            )}
          </div>
          <div className="none col g-2" style={{ minWidth: 220 }}>
            {audience.error ? <span className="t-sm" style={{ color: '#fff' }}>Audience unavailable</span>
              : !audience.data ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={36} />)
              : audience.data.map((a) => (
                <div key={a.key} className="row between" style={{ background: 'rgba(255,255,255,.07)', borderRadius: 8, padding: '9px 12px' }}>
                  <span className="t-sm" style={{ color: '#fff' }}>{a.label}</span>
                  <span className="t-micro" style={{ color: 'var(--text-on-navy)', opacity: .7 }}>{fmt.n(a.count)} accounts</span>
                </div>
              ))}
          </div>
        </div>
      </Card>

      <div className="grid g-2col g-4 mt-4">
        <Card title="Broadcast history" sub="Who sent what, and how many people it reached" flush>
          {history.error ? <ErrorState error={history.error} onRetry={() => history.refetch()} /> : (
            <DataTable
              rows={history.data?.rows}
              loading={history.isLoading}
              rowKey={(r) => r.id}
              emptyText="No broadcasts have been sent."
              columns={[
                { key: 'when', label: 'When', render: (r) => <span className="t-num">{fmt.dateTime(r.sentAt)}</span> },
                { key: 'what', label: 'Message', render: (r) => <><div className="t-sm">{r.message}</div><div className="t-micro t-muted">{r.audience}{r.sentByName ? ` · by ${r.sentByName}` : ''}</div></> },
                { key: 'reach', label: 'Reach', className: 'num', render: (r) => <span className="t-num">{fmt.n(r.recipients)}</span> },
                { key: 'type', label: 'Type', render: (r) => <Badge tone={typeTone(r.alertType)}>{r.alertType}</Badge> },
              ]}
            />
          )}
          <Pagination meta={history.data?.meta} onPage={setPage} />
        </Card>
        <Card title="Incident and audit trail" sub="Every safety event, open or closed" flush>
          {incidents.error ? <ErrorState error={incidents.error} onRetry={() => incidents.refetch()} /> : (
            <DataTable
              rows={incidents.data?.rows}
              loading={incidents.isLoading}
              rowKey={(r) => r.id}
              emptyText="No incidents recorded."
              columns={[
                { key: 'date', label: 'Date', render: (r) => fmt.date(r.occurredOn) },
                { key: 'summary', label: 'Incident', render: (r) => <><div className="t-sm">{r.summary}</div><div className="t-micro t-muted">{r.code} · {r.incidentType}</div></> },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
                { key: 'owner', label: 'Owner', render: (r) => r.ownerName ?? '—' },
              ]}
            />
          )}
        </Card>
      </div>

      {compose && <ComposeModal type={compose} total={total} audience={audience.data ?? []} onClose={() => setCompose(null)} />}
    </Page>
  );
}

function ComposeModal({ type, total, audience, onClose }: { type: string; total: number; audience: AudienceRow[]; onClose: () => void }) {
  const confirm = useConfirm();
  const { campusParam } = useSchool();
  const [f, setF] = useState({ alertType: type, message: '', channels: CHANNELS[0] });
  const [aud, setAud] = useState<Record<string, boolean>>({ parents: true, teachers: true, staff: true, management: true });
  const fe = useFieldErrors();
  const save = useApiMutation<Record<string, unknown>, { recipients: number }>('post', '/emergency/broadcasts', {
    invalidate: SAFETY_KEYS, onSuccess: onClose, success: (r) => `Broadcast sent to ${fmt.n(r.data.recipients)} recipients — logged in the audit trail`,
  });
  const chosen = Object.keys(aud).filter((k) => aud[k]);
  const reach = audience.filter((a) => aud[a.key]).reduce((a, x) => a + x.count, 0);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (f.message.trim().length < 10) e.message = 'Say what is happening and what people should do (at least 10 characters)';
    if (!chosen.length) e.audiences = 'Choose at least one audience';
    fe.setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await confirm({
      title: f.alertType === 'Drill' ? 'Send drill broadcast?' : `Send ${f.alertType.toLowerCase()} broadcast now?`,
      danger: f.alertType !== 'Drill', icon: 'megaphone', confirmLabel: 'Send broadcast now',
      body: (
        <div className="col g-3">
          <p className="t-sm">This reaches <strong>{fmt.n(reach)}</strong> people immediately by {f.channels}. It cannot be recalled.</p>
          <div className="card card--tint t-sm" style={{ padding: 12 }}>{f.alertType === 'Drill' ? 'DRILL — ' : ''}{f.message.trim()}</div>
        </div>
      ),
    });
    if (!ok) return;
    save.mutate({
      alertType: f.alertType, message: f.message.trim(), audiences: chosen, channels: f.channels, confirm: true,
      ...(campusParam.campusId ? { campusId: campusParam.campusId } : {}),
    }, { onError: fe.fromServer });
  };
  return (
    <FormModal title={f.alertType === 'Drill' ? 'Drill broadcast' : 'Emergency broadcast'} sub={`This reaches up to ${fmt.n(total)} people immediately`}
      onClose={onClose} busy={save.isPending} error={save.error} fieldErrors={fe.errors} onSubmit={submit}
      submitLabel="Send broadcast now" submitIcon="megaphone" danger>
      <Banner tone="critical" icon="alert"><strong>Confirm before sending.</strong> Emergency broadcasts bypass quiet hours and per-user notification settings.</Banner>
      <div className="mt-4 col g-3">
        <SelectField label="Type" required value={f.alertType} onChange={(v) => setF((x) => ({ ...x, alertType: v }))} options={TYPES} />
        <TextArea label="Message" required rows={3} maxLength={1000} value={f.message} placeholder="Say what is happening and what people should do."
          onChange={(v) => { setF((x) => ({ ...x, message: v })); fe.clear('message'); }} error={fe.errors.message}
          hint={f.alertType === 'Drill' ? 'Every message is prefixed with DRILL.' : undefined} />
        <div>
          <div className="label mb-2">Send to <span className="req">*</span></div>
          <div className="row g-3 wrap">
            {audience.map((a) => (
              <Checkbox key={a.key} checked={!!aud[a.key]} onChange={(v) => { setAud((x) => ({ ...x, [a.key]: v })); fe.clear('audiences'); }}
                label={`${a.label} (${fmt.n(a.count)})`} />
            ))}
          </div>
          {fe.errors.audiences && <span className="hint" style={{ color: 'var(--critical)' }} role="alert">{fe.errors.audiences}</span>}
        </div>
        <SelectField label="Channels" required value={f.channels} onChange={(v) => setF((x) => ({ ...x, channels: v }))} options={CHANNELS} />
      </div>
    </FormModal>
  );
}
