import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiQuery } from '@/hooks/useApi';
import { useSchool } from '@/layouts/SchoolContext';
import { Badge, DataTable, Person, type Sort } from '@/components/ui';
import { fmt } from '@/lib/format';
import type { Tone } from '@/lib/tones';
import type { Counsellor, Lead } from './types';

export const SOURCE_TONE: Record<string, Tone> = {
  WhatsApp: 'success', Website: 'info', 'Meta Ads': 'info', Referral: 'warning', Google: 'neutral', 'Walk-in': 'neutral', Instagram: 'warning', Phone: 'neutral',
};
export const SOURCE_COLOR: Record<string, string> = {
  WhatsApp: 'var(--teal)', Website: 'var(--navy)', 'Meta Ads': 'var(--viz-4)', Referral: 'var(--amber)', Google: 'var(--viz-5)',
  'Walk-in': 'var(--viz-7)', Instagram: 'var(--viz-6)', Phone: 'var(--viz-8)',
};

export const stageTone = (s: string): Tone => (s === 'Enrolled' ? 'success' : s === 'New Lead' ? 'info' : s === 'Lost' ? 'critical' : 'neutral');

export function SourceBadge({ source }: { source: string }) {
  return <Badge tone={SOURCE_TONE[source] ?? 'neutral'}>{source}</Badge>;
}

export function ScoreCell({ score }: { score: number }) {
  return <span className={`t-num t-bold ${score >= 80 ? 't-success' : score < 55 ? 't-critical' : ''}`}>{score}</span>;
}

/** datetime-local input value (browser local time) → ISO string. */
export const localToIso = (v: string) => new Date(v).toISOString();
/** A datetime-local value n days from now at hh:mm. */
export function localInput(days = 1, hhmm = '10:00') {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "Wed 17 Sep · 10:00" in school time. */
export function whenLabel(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}`;
}

export const PHONE_RE = /^\+?[0-9 ]{8,16}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The lead profile opens over any admissions screen via ?lead=LD-4412, so it can be linked and bookmarked. */
export function useLeadParam() {
  const [sp, setSp] = useSearchParams();
  const leadCode = sp.get('lead');
  const openLead = useCallback((code: string) => setSp((prev) => {
    const next = new URLSearchParams(prev);
    next.set('lead', code);
    return next;
  }), [setSp]);
  const closeLead = useCallback(() => setSp((prev) => {
    const next = new URLSearchParams(prev);
    next.delete('lead');
    return next;
  }, { replace: true }), [setSp]);
  return { leadCode, openLead, closeLead };
}

export function useCounsellors() {
  const { campusParam } = useSchool();
  return useApiQuery<Counsellor[]>('/admissions/counsellors', campusParam, { staleTime: 60_000 });
}

export function LeadsTable({ rows, loading, sort, onSort, onOpen, emptyText }: {
  rows: Lead[] | undefined; loading?: boolean; sort?: Sort; onSort?: (s: Sort) => void; onOpen: (code: string) => void; emptyText?: string;
}) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(r) => r.id}
      sort={sort}
      onSort={onSort}
      onRowClick={(r) => onOpen(r.code)}
      emptyText={emptyText ?? 'No leads match the current filters.'}
      columns={[
        { key: 'student', label: 'Student / Parent', render: (r) => <Person name={r.studentName} meta={`${r.parentName} · ${r.code}`} /> },
        { key: 'grade', label: 'Grade', render: (r) => r.grade },
        { key: 'curriculum', label: 'Curriculum', render: (r) => <span className="t-xs t-muted">{r.curriculum ?? '—'}</span> },
        { key: 'source', label: 'Source', render: (r) => <SourceBadge source={r.source} /> },
        { key: 'stage', label: 'Stage', render: (r) => <Badge tone={stageTone(r.stage)}>{r.stage}</Badge> },
        { key: 'score', label: 'Score', className: 'num', render: (r) => <ScoreCell score={r.score} /> },
        {
          key: 'counsellor', label: 'Counsellor', render: (r) =>
            r.counsellor ? r.counsellor : ['Enrolled', 'Lost'].includes(r.stage) ? <span className="t-faint">—</span> : <Badge tone="critical">Unassigned</Badge>,
        },
        {
          key: 'next', label: 'Next action', render: (r) => (
            <span className={`t-xs ${r.overdue ? 't-critical t-bold' : ''}`} title={r.nextActionAt ? fmt.dateTime(r.nextActionAt) : undefined}>
              {r.nextAction ?? '—'}{r.overdue ? ' · overdue' : ''}
            </span>
          ),
        },
      ]}
    />
  );
}

export function PipeCard({ lead, onOpen }: { lead: Lead; onOpen: (code: string) => void }) {
  return (
    <button type="button" className="pipecard" onClick={() => onOpen(lead.code)} aria-label={`${lead.studentName}, ${lead.grade}, score ${lead.score}`}>
      <span className="row between">
        <span className="t-sm t-bold t-clip">{lead.studentName}</span>
        <span className="t-micro t-muted t-num">{lead.score}</span>
      </span>
      <span className="t-micro t-muted" style={{ display: 'block' }}>{lead.grade} · {lead.parentName}</span>
      <span className="row between mt-2">
        <SourceBadge source={lead.source} />
        <span className={`t-micro ${lead.counsellor ? 't-muted' : 't-critical t-bold'}`}>{lead.counsellor ? lead.counsellor.split(' ')[0] : 'Unassigned'}</span>
      </span>
    </button>
  );
}
