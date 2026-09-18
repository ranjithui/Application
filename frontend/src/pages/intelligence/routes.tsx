import { lazy } from 'react';
import type { AppRoute } from '../registry';

/**
 * intelligence screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Pages are lazy-loaded.
 */
const EarlyWarningPage = lazy(() => import('./EarlyWarningPage'));
const TalentPage = lazy(() => import('./TalentPage'));
const WellbeingPage = lazy(() => import('./WellbeingPage'));
const PortfolioPage = lazy(() => import('./PortfolioPage'));
const CopilotPage = lazy(() => import('./CopilotPage'));
const KnowledgePage = lazy(() => import('./KnowledgePage'));
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const DayInLifePage = lazy(() => import('./DayInLifePage'));
const AutomationsPage = lazy(() => import('./AutomationsPage'));
const WhatsappAiPage = lazy(() => import('./WhatsappAiPage'));
const DesignSystemPage = lazy(() => import('./DesignSystemPage'));

const STAFF_STUDENTS = ['students.read', 'students.read_assigned'];

export const routes: AppRoute[] = [
  { path: '/early-warning', perm: ['earlywarning.read'], element: <EarlyWarningPage /> },
  { path: '/talent', perm: ['students.read', 'students.read_assigned', 'ai.use'], element: <TalentPage /> },
  { path: '/wellbeing', perm: STAFF_STUDENTS, element: <WellbeingPage /> },
  { path: '/portfolio', perm: STAFF_STUDENTS, element: <PortfolioPage /> },
  { path: '/copilot', perm: ['ai.use'], element: <CopilotPage /> },
  { path: '/knowledge-ai', perm: ['ai.use'], element: <KnowledgePage /> },
  { path: '/analytics', perm: ['reports.read'], element: <AnalyticsPage /> },
  { path: '/reports', perm: ['reports.read'], element: <ReportsPage /> },
  { path: '/day-in-life', perm: ['prototype.view'], element: <DayInLifePage /> },
  { path: '/automations', perm: ['prototype.view'], element: <AutomationsPage /> },
  { path: '/whatsapp-ai', perm: ['prototype.view'], element: <WhatsappAiPage /> },
  { path: '/design-system', perm: ['prototype.view'], element: <DesignSystemPage /> },
];
