import { useState } from 'react';
import {
  Badge, Button, Card, DataTable, Empty, ErrorState, Meter, Modal, Page, PageHead, SearchInput, SelectField, Status, TextField, useConfirm,
} from '@/components/ui';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/auth/AuthContext';
import { useSchool } from '@/layouts/SchoolContext';
import { fmt } from '@/lib/format';
import { FormGrid, addDaysIso, req, todayIso, useCampusOptions, useForm } from './shared';

interface Facility {
  id: string; name: string; facilityType: string; capacity: number | null; status: string; campusId: string; campusName: string;
  bookedHours: number; utilisation: number; today: { id: string; purpose: string; startsAt: string; endsAt: string }[]; openRequests: number;
}
interface Booking { id: string; bookedOn: string; startsAt: string; endsAt: string; purpose: string; bookedBy: string | null; bookedById: string | null }

const TYPES = ['Classroom', 'Lab', 'Hall', 'Field', 'Library', 'Studio', 'Other'];

export default function FacilitiesPage() {
  const { campusParam } = useSchool();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const list = useApiQuery<Facility[]>('/facilities', { ...campusParam, q: q || undefined });
  const [book, setBook] = useState<Facility | null>(null);
  const [edit, setEdit] = useState<Facility | 'new' | null>(null);
  return (
    <Page>
      <PageHead title="Facilities" sub="Rooms, capacity, bookings and how heavily each space is used."
        actions={<>
          {can('operations.manage') && <Button icon="plus" onClick={() => setEdit('new')}>Add space</Button>}
          <Button variant="primary" icon="calendar" disabled={!list.data?.length} onClick={() => setBook(list.data?.find((f) => f.status === 'Available') ?? list.data![0])}>Book a room</Button>
        </>} />
      <div className="filterbar"><SearchInput value={q} onSearch={setQ} placeholder="Search spaces" /></div>
      <Card flush>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} /> : (
          <DataTable<Facility>
            rows={list.data} loading={list.isLoading} rowKey={(r) => r.id} emptyText="No spaces recorded for this campus."
            columns={[
              { key: 'name', label: 'Space', render: (r) => <><span className="t-bold">{r.name}</span><div className="t-micro t-muted">{r.facilityType} · {r.campusName}</div></> },
              { key: 'capacity', label: 'Capacity', className: 'num', render: (r) => <span className="t-num">{r.capacity ?? '—'}</span> },
              { key: 'today', label: 'Today', render: (r) => r.today.length
                ? <span className="t-sm">{r.today.map((b) => `${b.purpose} (${b.startsAt}–${b.endsAt})`).join(', ')}</span>
                : <span className="t-faint">No bookings</span> },
              { key: 'status', label: 'Status', render: (r) => <><Status value={r.status} />{r.openRequests > 0 && <div className="t-micro t-warning mt-1">{r.openRequests} open request(s)</div>}</> },
              { key: 'util', label: 'Weekly utilisation', render: (r) => (
                <Meter label={`${fmt.n(r.bookedHours)} h of 40 h`} value={r.utilisation} tone={r.utilisation > 80 ? 'critical' : r.utilisation > 60 ? 'amber' : 'teal'} />
              ) },
              { key: 'a', label: '', className: 'num', render: (r) => (
                <div className="row g-2" style={{ justifyContent: 'flex-end' }}>
                  <Button size="sm" disabled={r.status === 'Closed' || r.status === 'Maintenance'} onClick={() => setBook(r)}>Book</Button>
                  {can('operations.manage') && <Button size="sm" variant="quiet" icon="edit" aria-label={`Edit ${r.name}`} onClick={() => setEdit(r)} />}
                </div>
              ) },
            ]}
          />
        )}
      </Card>
      {book && list.data && <BookingModal facilities={list.data} initial={book} onClose={() => setBook(null)} />}
      {edit && <FacilityModal facility={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function BookingModal({ facilities, initial, onClose }: { facilities: Facility[]; initial: Facility; onClose: () => void }) {
  const { user, can } = useAuth();
  const confirm = useConfirm();
  const f = useForm({ facilityId: initial.id, bookedOn: todayIso(), startsAt: '09:00', endsAt: '10:00', purpose: '' });
  const v = f.values;
  const bookings = useApiQuery<{ bookings: Booking[] }>(`/facilities/${v.facilityId}/bookings`, { from: todayIso(), to: addDaysIso(13) });
  const save = useApiMutation<Record<string, unknown>>('post', `/facilities/${v.facilityId}/bookings`, { invalidate: ['/facilities'], success: 'Room booked' });
  const cancel = useApiMutation<string>('delete', (id) => `/facility-bookings/${id}`, { invalidate: ['/facilities'], success: 'Booking cancelled' });
  const submit = async () => {
    if (!f.validate({
      bookedOn: req(v.bookedOn, 'Date') ?? (v.bookedOn < todayIso() ? 'Choose today or a later date' : null),
      startsAt: req(v.startsAt, 'Start'),
      endsAt: req(v.endsAt, 'End') ?? (v.endsAt <= v.startsAt ? 'End must be after start' : null),
      purpose: req(v.purpose, 'Purpose') ?? (v.purpose.trim().length < 3 ? 'Describe the booking' : null),
    })) return;
    try { await save.mutateAsync({ bookedOn: v.bookedOn, startsAt: v.startsAt, endsAt: v.endsAt, purpose: v.purpose }); f.set('purpose', ''); } catch (e) { f.fromError(e); }
  };
  const bookable = facilities.filter((x) => x.status !== 'Closed' && x.status !== 'Maintenance');
  return (
    <Modal open onClose={onClose} title="Book a room" sub="Clashing bookings are refused automatically." size="wide" busy={save.isPending}
      foot={<><Button onClick={onClose}>Close</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Confirm booking</Button></>}>
      <FormGrid>
        <SelectField label="Space" required value={v.facilityId} onChange={(x) => f.set('facilityId', x)}
          options={bookable.map((x) => ({ value: x.id, label: `${x.name} (${x.campusName})` }))} />
        <TextField label="Date" type="date" required min={todayIso()} value={v.bookedOn} onChange={(x) => f.set('bookedOn', x)} error={f.errors.bookedOn} />
        <TextField label="From" type="time" required value={v.startsAt} onChange={(x) => f.set('startsAt', x)} error={f.errors.startsAt} />
        <TextField label="To" type="time" required value={v.endsAt} onChange={(x) => f.set('endsAt', x)} error={f.errors.endsAt} />
      </FormGrid>
      <div className="mt-3"><TextField label="Purpose" required value={v.purpose} maxLength={160} onChange={(x) => f.set('purpose', x)} error={f.errors.purpose} placeholder="e.g. Grade 6C practical, P6" /></div>
      <div className="eyebrow mt-4 mb-2">Next two weeks</div>
      {bookings.isLoading ? <span className="t-sm t-muted">Loading bookings…</span> : bookings.error ? <ErrorState error={bookings.error} onRetry={bookings.refetch} />
        : !bookings.data?.bookings.length ? <Empty icon="calendar" title="No bookings yet" sub="This space is free for the next two weeks." /> : (
          <DataTable<Booking> compact stack={false} rows={bookings.data.bookings} rowKey={(b) => b.id} columns={[
            { key: 'bookedOn', label: 'Date', render: (b) => fmt.date(b.bookedOn) },
            { key: 'time', label: 'Time', render: (b) => <span className="t-num">{b.startsAt}–{b.endsAt}</span> },
            { key: 'purpose', label: 'Purpose' },
            { key: 'by', label: 'Booked by', render: (b) => b.bookedBy ?? '—' },
            { key: 'a', label: '', className: 'num', render: (b) => (b.bookedById === user?.id || can('operations.manage')) ? (
              <Button size="sm" variant="quiet" loading={cancel.isPending && cancel.variables === b.id} onClick={async () => {
                if (await confirm({ title: 'Cancel this booking?', body: `${b.purpose} on ${fmt.date(b.bookedOn)}, ${b.startsAt}–${b.endsAt}.`, confirmLabel: 'Cancel booking', danger: true })) cancel.mutate(b.id);
              }}>Cancel</Button>) : null },
          ]} />
        )}
    </Modal>
  );
}

function FacilityModal({ facility, onClose }: { facility: Facility | null; onClose: () => void }) {
  const campuses = useCampusOptions();
  const f = useForm({
    campusId: facility?.campusId ?? campuses.defaultId, name: facility?.name ?? '', facilityType: facility?.facilityType ?? '',
    capacity: facility?.capacity != null ? String(facility.capacity) : '', status: facility?.status ?? 'Available',
  });
  const v = f.values;
  const save = useApiMutation<Record<string, unknown>>(facility ? 'put' : 'post', facility ? `/facilities/${facility.id}` : '/facilities',
    { invalidate: ['/facilities'], success: facility ? 'Space updated' : 'Space added' });
  const submit = async () => {
    if (!f.validate({
      name: req(v.name, 'Name'), facilityType: req(v.facilityType, 'Type'), campusId: req(v.campusId, 'Campus'),
      capacity: v.capacity && !(Number(v.capacity) >= 1) ? 'Enter a capacity of at least 1' : null,
    })) return;
    try { await save.mutateAsync({ ...v, capacity: v.capacity ? Number(v.capacity) : null }); onClose(); } catch (e) { f.fromError(e); }
  };
  return (
    <Modal open onClose={onClose} title={facility ? `Edit ${facility.name}` : 'Add a space'} busy={save.isPending}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></>}>
      <FormGrid>
        <TextField label="Name" required value={v.name} onChange={(x) => f.set('name', x)} error={f.errors.name} maxLength={120} />
        <SelectField label="Type" required value={v.facilityType} onChange={(x) => f.set('facilityType', x)} options={TYPES} placeholder="Choose…" error={f.errors.facilityType} />
        <SelectField label="Campus" required value={v.campusId} onChange={(x) => f.set('campusId', x)} options={campuses.options} />
        <TextField label="Capacity" type="number" min={1} value={v.capacity} onChange={(x) => f.set('capacity', x)} error={f.errors.capacity} />
        <SelectField label="Status" value={v.status} onChange={(x) => f.set('status', x)} options={['Available', 'In use', 'Maintenance', 'Closed']} />
      </FormGrid>
      {facility?.status === 'Maintenance' && <div className="mt-3"><Badge tone="warning">Bookings are blocked while under maintenance</Badge></div>}
    </Modal>
  );
}
