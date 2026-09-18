import { lazy } from 'react';
import type { AppRoute } from '../registry';

/**
 * safety screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Pages are lazy-loaded.
 */
const SmartGatePage = lazy(() => import('./SmartGatePage'));
const GateLogPage = lazy(() => import('./GateLogPage'));
const PickupPage = lazy(() => import('./PickupPage'));
const VisitorsPage = lazy(() => import('./VisitorsPage'));
const BusTrackingPage = lazy(() => import('./BusTrackingPage'));
const RoutesPage = lazy(() => import('./RoutesPage'));
const BoardingPage = lazy(() => import('./BoardingPage'));
const EmergencyPage = lazy(() => import('./EmergencyPage'));
const SafeguardingPage = lazy(() => import('./SafeguardingPage'));
const InfirmaryPage = lazy(() => import('./InfirmaryPage'));
const CounsellingPage = lazy(() => import('./CounsellingPage'));

export const routes: AppRoute[] = [
  { path: '/smart-gate', perm: ['safety.read'], element: <SmartGatePage /> },
  { path: '/gate-log', perm: ['safety.read'], element: <GateLogPage /> },
  { path: '/pickup', perm: ['safety.read'], element: <PickupPage /> },
  { path: '/visitors', perm: ['safety.read'], element: <VisitorsPage /> },
  { path: '/bus-tracking', perm: ['transport.read'], element: <BusTrackingPage /> },
  { path: '/routes', perm: ['transport.read'], element: <RoutesPage /> },
  { path: '/boarding', perm: ['transport.read'], element: <BoardingPage /> },
  { path: '/emergency', perm: ['safety.read'], element: <EmergencyPage /> },
  { path: '/safeguarding', perm: ['safety.read'], element: <SafeguardingPage /> },
  { path: '/infirmary', perm: ['safety.read'], element: <InfirmaryPage /> },
  { path: '/counselling', perm: ['safety.read'], element: <CounsellingPage /> },
];
