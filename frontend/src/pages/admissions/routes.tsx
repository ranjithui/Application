import { lazy } from 'react';
import type { AppRoute } from '../registry';

/**
 * Admissions & CRM screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Pages are lazy-loaded.
 */
const AdmissionsDashboardPage = lazy(() => import('./AdmissionsDashboardPage'));
const LeadsPage = lazy(() => import('./LeadsPage'));
const EnquiriesPage = lazy(() => import('./EnquiriesPage'));
const PipelinePage = lazy(() => import('./PipelinePage'));
const ApplicationsPage = lazy(() => import('./ApplicationsPage'));
const VisitsPage = lazy(() => import('./VisitsPage'));
const ConversionPage = lazy(() => import('./ConversionPage'));
const ReferralsPage = lazy(() => import('./ReferralsPage'));
const AlumniPage = lazy(() => import('./AlumniPage'));
const VendorsPage = lazy(() => import('./VendorsPage'));

const ADMISSIONS = ['admissions.read'];
const CRM = ['crm.read'];

export const routes: AppRoute[] = [
  { path: '/admissions', perm: ADMISSIONS, element: <AdmissionsDashboardPage /> },
  { path: '/leads', perm: ADMISSIONS, element: <LeadsPage /> },
  { path: '/enquiries', perm: ADMISSIONS, element: <EnquiriesPage /> },
  { path: '/pipeline', perm: ADMISSIONS, element: <PipelinePage /> },
  { path: '/applications', perm: ADMISSIONS, element: <ApplicationsPage /> },
  { path: '/visits', perm: ADMISSIONS, element: <VisitsPage /> },
  { path: '/conversion', perm: ADMISSIONS, element: <ConversionPage /> },
  { path: '/referrals', perm: ADMISSIONS, element: <ReferralsPage /> },
  { path: '/alumni', perm: CRM, element: <AlumniPage /> },
  { path: '/vendors', perm: CRM, element: <VendorsPage /> },
];
