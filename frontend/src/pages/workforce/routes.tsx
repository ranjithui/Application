import { lazy } from 'react';
import type { AppRoute } from '../registry';

/**
 * workforce screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Pages are lazy-loaded.
 */
const WorkforcePage = lazy(() => import('./WorkforcePage'));
const StaffListPage = lazy(() => import('./StaffListPage'));
const StaffAttendancePage = lazy(() => import('./StaffAttendancePage'));
const ShiftsPage = lazy(() => import('./ShiftsPage'));
const LeavePage = lazy(() => import('./LeavePage'));
const OvertimePage = lazy(() => import('./OvertimePage'));
const WorkloadPage = lazy(() => import('./WorkloadPage'));
const CpdPage = lazy(() => import('./CpdPage'));
const PayrollPage = lazy(() => import('./PayrollPage'));
const PayslipsPage = lazy(() => import('./PayslipsPage'));
const PayslipPrintPage = lazy(() => import('./PayslipPrintPage'));
const StaffSelfPage = lazy(() => import('./StaffSelfPage'));

export const routes: AppRoute[] = [
  { path: '/workforce', perm: ['hr.read'], element: <WorkforcePage /> },
  { path: '/teaching-staff', perm: ['hr.read'], element: <StaffListPage key="teaching" type="teaching" /> },
  { path: '/non-teaching-staff', perm: ['hr.read'], element: <StaffListPage key="non_teaching" type="non_teaching" /> },
  { path: '/staff-attendance', perm: ['hr.read'], element: <StaffAttendancePage /> },
  { path: '/shifts', perm: ['hr.read'], element: <ShiftsPage /> },
  { path: '/leave', perm: ['hr.read'], element: <LeavePage /> },
  { path: '/overtime', perm: ['hr.read'], element: <OvertimePage /> },
  { path: '/workload', perm: ['hr.read'], element: <WorkloadPage /> },
  { path: '/cpd', perm: ['hr.read'], element: <CpdPage /> },
  { path: '/payroll', perm: ['payroll.read'], element: <PayrollPage /> },
  { path: '/payslips', perm: ['payroll.read'], element: <PayslipsPage /> },
  { path: '/payslips/:id', perm: ['payroll.read'], element: <PayslipPrintPage /> },
  { path: '/staff-self', perm: ['selfservice.use'], element: <StaffSelfPage /> },
  { path: '/staff-self/payslips/:id', perm: ['selfservice.use'], element: <PayslipPrintPage self /> },
];
