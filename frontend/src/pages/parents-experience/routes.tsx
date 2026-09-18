import { lazy } from 'react';
import type { AppRoute } from '../registry';

const ParentDirectoryPage = lazy(() => import('./ParentDirectoryPage'));
const ParentCommunicationPage = lazy(() => import('./ParentCommunicationPage'));
const PtmPage = lazy(() => import('./PtmPage'));
const CircularsPage = lazy(() => import('./CircularsPage'));
const OpCircularsPage = lazy(() => import('./OpCircularsPage'));
const EventsPage = lazy(() => import('./EventsPage'));
const AcknowledgementsPage = lazy(() => import('./AcknowledgementsPage'));

/**
 * parents-experience screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Parent 360 (/parent-360) is owned by another module.
 */
export const routes: AppRoute[] = [
  { path: '/parent-directory', perm: ['parents.read'], element: <ParentDirectoryPage /> },
  { path: '/parent-communication', perm: ['communication.read'], element: <ParentCommunicationPage /> },
  { path: '/ptm', perm: ['communication.read'], element: <PtmPage /> },
  { path: '/circulars', perm: ['communication.read'], element: <CircularsPage /> },
  { path: '/op-circulars', perm: ['operations.read'], element: <OpCircularsPage /> },
  { path: '/events', perm: ['communication.read'], element: <EventsPage /> },
  { path: '/acknowledgements', perm: ['communication.read'], element: <AcknowledgementsPage /> },
];
