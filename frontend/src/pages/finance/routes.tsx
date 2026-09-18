import { lazy } from 'react';
import type { AppRoute } from '../registry';

/**
 * Finance screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Pages are lazy-loaded.
 */
const FeeStructuresPage = lazy(() => import('./FeeStructuresPage'));
const FeesPage = lazy(() => import('./FeesPage'));
const StudentAccountsPage = lazy(() => import('./StudentAccountsPage'));
const PaymentsPage = lazy(() => import('./PaymentsPage'));
const ReceiptsPage = lazy(() => import('./ReceiptsPage'));
const ConcessionsPage = lazy(() => import('./ConcessionsPage'));
const ScholarshipsPage = lazy(() => import('./ScholarshipsPage'));
const ExpensesPage = lazy(() => import('./ExpensesPage'));
const ReimbursementsPage = lazy(() => import('./ReimbursementsPage'));
const AllowancesPage = lazy(() => import('./AllowancesPage'));
const BudgetsPage = lazy(() => import('./BudgetsPage'));
const ReconciliationPage = lazy(() => import('./ReconciliationPage'));
const FinancialReportsPage = lazy(() => import('./FinancialReportsPage'));

const READ = ['finance.read'];

export const routes: AppRoute[] = [
  { path: '/fee-structures', perm: READ, element: <FeeStructuresPage /> },
  { path: '/fees', perm: READ, element: <FeesPage /> },
  { path: '/student-accounts', perm: READ, element: <StudentAccountsPage /> },
  { path: '/payments', perm: READ, element: <PaymentsPage /> },
  { path: '/receipts', perm: READ, element: <ReceiptsPage /> },
  { path: '/concessions', perm: READ, element: <ConcessionsPage /> },
  { path: '/scholarships', perm: READ, element: <ScholarshipsPage /> },
  { path: '/expenses', perm: READ, element: <ExpensesPage /> },
  { path: '/reimbursements', perm: READ, element: <ReimbursementsPage /> },
  { path: '/allowances', perm: READ, element: <AllowancesPage sub="Recurring allowances that feed the payroll run each month." /> },
  { path: '/staff-allowances', perm: ['hr.read', 'finance.read'], element: <AllowancesPage sub="Recurring allowances by employee category, applied automatically in payroll." /> },
  { path: '/budgets', perm: READ, element: <BudgetsPage /> },
  { path: '/reconciliation', perm: READ, element: <ReconciliationPage /> },
  { path: '/financial-reports', perm: READ, element: <FinancialReportsPage /> },
];
