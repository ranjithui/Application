import { lazy } from 'react';
import type { AppRoute } from '../registry';

const GroupDashboardPage = lazy(() => import('./GroupDashboardPage'));
const CampusComparisonPage = lazy(() => import('./CampusComparisonPage'));
const CampusesPage = lazy(() => import('./CampusesPage'));
const TransfersPage = lazy(() => import('./TransfersPage'));
const GroupPoliciesPage = lazy(() => import('./GroupPoliciesPage'));

/**
 * Group management (multi-campus) screens. The API enforces the same permissions.
 */
export const routes: AppRoute[] = [
  { path: '/group-dashboard', perm: ['dashboard.group'], element: <GroupDashboardPage /> },
  { path: '/campus-comparison', perm: ['group.read'], element: <CampusComparisonPage /> },
  { path: '/campuses', perm: ['group.read'], element: <CampusesPage /> },
  { path: '/transfers', perm: ['group.read'], element: <TransfersPage /> },
  { path: '/group-policies', perm: ['group.read'], element: <GroupPoliciesPage /> },
];
