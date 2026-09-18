import { lazy } from 'react';
import type { AppRoute } from '../registry';

const AssetsPage = lazy(() => import('./AssetsPage'));
const FacilitiesPage = lazy(() => import('./FacilitiesPage'));
const MaintenancePage = lazy(() => import('./MaintenancePage'));
const InventoryPage = lazy(() => import('./InventoryPage'));
const DocumentsPage = lazy(() => import('./DocumentsPage'));
const CertificatesPage = lazy(() => import('./CertificatesPage'));
const CompliancePage = lazy(() => import('./CompliancePage'));
const AuditPage = lazy(() => import('./AuditPage'));

/**
 * Operations screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule.
 */
export const routes: AppRoute[] = [
  { path: '/assets', perm: ['operations.read'], element: <AssetsPage /> },
  { path: '/facilities', perm: ['operations.read'], element: <FacilitiesPage /> },
  { path: '/maintenance', perm: ['operations.read'], element: <MaintenancePage /> },
  { path: '/inventory', perm: ['operations.read'], element: <InventoryPage /> },
  { path: '/documents', perm: ['documents.read'], element: <DocumentsPage /> },
  { path: '/certificates', perm: ['documents.read'], element: <CertificatesPage /> },
  { path: '/compliance', perm: ['operations.read'], element: <CompliancePage /> },
  { path: '/audit', perm: ['audit.read'], element: <AuditPage /> },
];
