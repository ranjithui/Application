import { lazy } from 'react';
import type { AppRoute } from '../registry';

const StudentsPage = lazy(() => import('./StudentsPage'));
const Student360Page = lazy(() => import('./Student360Page'));
const MyProfilePage = lazy(() => import('./MyProfilePage'));
const MyIdeasPage = lazy(() => import('./MyIdeasPage'));

const STAFF = ['students.read', 'students.read_assigned'];

export const routes: AppRoute[] = [
  { path: '/students', perm: STAFF, element: <StudentsPage /> },
  { path: '/student-360', perm: STAFF, element: <Student360Page /> },
  { path: '/student-360/:id', perm: STAFF, element: <Student360Page /> },
  { path: '/my-profile', perm: ['student_portal.use'], element: <MyProfilePage /> },
  { path: '/my-ideas', perm: ['student_portal.use'], element: <MyIdeasPage /> },
];
