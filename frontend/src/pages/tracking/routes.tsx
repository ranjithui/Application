import { lazy } from 'react';
import type { AppRoute } from '../registry';

const StudentTrackingPage = lazy(() => import('./StudentTrackingPage'));
const PERM = ['tracking.read_all', 'tracking.read_assigned'];

export const routes: AppRoute[] = [
  { path: '/student-tracking', perm: PERM, element: <StudentTrackingPage /> },
  { path: '/student-tracking/:id', perm: PERM, element: <StudentTrackingPage /> },
];
