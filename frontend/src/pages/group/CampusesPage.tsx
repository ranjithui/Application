import { useState } from 'react';
import { Badge, Button, Card, Dl, ErrorState, Icon, Modal, Page, PageHead, Skeleton, TextArea, TextField } from '@/components/ui';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { fmt } from '@/lib/format';
import { FormGrid, req, useForm } from '../operations/shared';
import type { CampusMetrics } from './shared';

const BANNERS = ['#990033,#B30042', '#7A0029,#990033', '#C27E0A,#D49308'];

export default function CampusesPage() {
  const q = useApiQuery<CampusMetrics[]>('/group/campuses');
  const school = useSchool();
  const { can } = useAuth();
  const [edit, setEdit] = useState<CampusMetrics | null>(null);
  return (
    <Page>
      <PageHead title="Campuses" sub={`The ${q.data?.length ?? ''} campuses in the Holy Sai group.`}
        actions={can('dashboard.group') && <Button variant="primary" icon="globe" to="/group-dashboard">Group dashboard</Button>} />
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="grid g-3col g-4">
          {q.isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={360} style={{ borderRadius: 14 }} />) : q.data!.map((c, i) => {
            const current = school.scope === 'campus' && school.campusId === c.id;
            return (
              <Card key={c.id}>
                <div style={{ height: 86, margin: '-20px -20px 16px', background: `linear-gradient(135deg,${BANNERS[i % BANNERS.length]})`, display: 'grid', placeItems: 'center', color: '#fff', borderRadius: 'var(--r-lg) var(--r-lg) 0 0' }}>
                  <Icon name="building" size={28} />
                </div>
                <div className="row between"><span className="t-bold">{c.name}</span>{current && <Badge tone="success">Current</Badge>}</div>
                <div className="t-xs t-muted mt-1">{c.place} · since {c.established ?? '—'}</div>
                <div className="mt-3">
                  <Dl items={[
                    ['Curriculum', c.curriculum ?? '—'],
                    ['Students', fmt.n(c.students)],
                    ['Staff', c.staffTarget ? `${fmt.n(c.staff)} of ${fmt.n(c.staffTarget)}` : fmt.n(c.staff)],
                    ['Attendance', fmt.pct(c.attendancePct, 1)],
                    ['Fee collection', fmt.pct(c.collectionPct, 1)],
                    ['Parent NPS', c.nps != null ? fmt.n(c.nps) : '—'],
                  ]} />
                </div>
                {c.address && <p className="t-xs t-muted mt-3">{c.address}</p>}
                <div className="col g-2 mt-4">
                  <Button block disabled={current} onClick={() => school.setCampus(c.id)}>{current ? 'Current campus' : 'Switch to this campus'}</Button>
                  {can('group.manage') && <Button block variant="quiet" icon="edit" onClick={() => setEdit(c)}>Edit details</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {edit && <EditCampus campus={edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function EditCampus({ campus, onClose }: { campus: CampusMetrics; onClose: () => void }) {
  const f = useForm({
    name: campus.name, shortName: campus.shortName, place: campus.place, curriculum: campus.curriculum ?? '', address: campus.address ?? '',
    established: campus.established ? String(campus.established) : '', staffingTarget: campus.staffTarget ? String(campus.staffTarget) : '',
  });
  const v = f.values;
  const save = useApiMutation<Record<string, unknown>>('put', `/group/campuses/${campus.id}`, { invalidate: ['/group', '/lookups'], success: 'Campus updated' });
  const year = new Date().getFullYear();
  const submit = async () => {
    if (!f.validate({
      name: req(v.name, 'Name'), shortName: req(v.shortName, 'Short name'), place: req(v.place, 'Place'),
      established: v.established && !(Number(v.established) >= 1900 && Number(v.established) <= year) ? `Enter a year between 1900 and ${year}` : null,
      staffingTarget: v.staffingTarget && !(Number.isInteger(Number(v.staffingTarget)) && Number(v.staffingTarget) >= 1) ? 'Enter a whole number of positions' : null,
    })) return;
    try {
      await save.mutateAsync({
        name: v.name.trim(), shortName: v.shortName.trim(), place: v.place.trim(), curriculum: v.curriculum || null, address: v.address || null,
        ...(v.established ? { established: Number(v.established) } : {}), ...(v.staffingTarget ? { staffingTarget: Number(v.staffingTarget) } : {}),
      });
      onClose();
    } catch (e) { f.fromError(e); }
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${campus.shortName}`} sub="Changes apply across the application and are audited." busy={save.isPending} size="wide"
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <FormGrid>
        <TextField label="Campus name" required maxLength={120} value={v.name} onChange={(x) => f.set('name', x)} error={f.errors.name} />
        <TextField label="Short name" required maxLength={40} value={v.shortName} onChange={(x) => f.set('shortName', x)} error={f.errors.shortName} />
        <TextField label="Place" required maxLength={80} value={v.place} onChange={(x) => f.set('place', x)} error={f.errors.place} />
        <TextField label="Established" type="number" min={1900} max={year} value={v.established} onChange={(x) => f.set('established', x)} error={f.errors.established} />
        <TextField label="Curriculum" maxLength={160} value={v.curriculum} onChange={(x) => f.set('curriculum', x)} />
        <TextField label="Approved staff positions" type="number" min={1} value={v.staffingTarget} onChange={(x) => f.set('staffingTarget', x)}
          error={f.errors.staffingTarget} hint="Used for the Staff filled measure" />
      </FormGrid>
      <div className="mt-3"><TextArea label="Address" rows={2} maxLength={300} value={v.address} onChange={(x) => f.set('address', x)} /></div>
    </Modal>
  );
}
