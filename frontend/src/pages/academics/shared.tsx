/** Shared types and helpers for the academics screens. */
import { useApiQuery } from '@/hooks/useApi';
import { ApiError } from '@/api/client';
import { todayKey } from '@/lib/format';

export interface SectionOption {
  id: string;
  label: string;
  name: string;
  classId: string;
  className: string;
  gradeLevel: number;
  campusId: string;
  campusName: string;
  room: string | null;
  students: number;
  mySubjects: string[];
  isClassTeacher: boolean;
}

/** Sections the signed-in user may work with (teachers: their own; staff: the header campus). */
export function useSections(campusId?: string) {
  return useApiQuery<SectionOption[]>('/academics/sections', { campusId }, { staleTime: 60_000 });
}

/** Field → message map from a failed mutation (server validation), keyed by the last path part. */
export function serverFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(err.fieldErrors)) {
    out[k] = v;
    const last = k.split('.').pop()!;
    if (!out[last]) out[last] = v;
  }
  return out;
}

export const today = () => todayKey();

/** Meter tone used across the wireframe: teal ≥ hi, amber ≥ lo, otherwise critical. */
export function meterTone(value: number, hi = 80, lo = 50) {
  return value >= hi ? 'teal' : value >= lo ? 'amber' : 'critical';
}

export function ratio(n: number, of: number) {
  return of ? (100 * n) / of : 0;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export const SUBJECT_SHORT: Record<string, string> = {
  Mathematics: 'Maths', 'Social Studies': 'Social', 'Art and Design': 'Art',
};
