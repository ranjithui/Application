import { lazy } from 'react';
import type { AppRoute } from '../registry';

const InnovationDashboardPage = lazy(() => import('./InnovationDashboardPage'));
const IdeasPage = lazy(() => import('./IdeasPage'));
const ProjectsPage = lazy(() => import('./ProjectsPage'));
const ProjectPage = lazy(() => import('./ProjectPage'));
const MentorsPage = lazy(() => import('./MentorsPage'));
const MilestonesPage = lazy(() => import('./MilestonesPage'));
const CompetitionsPage = lazy(() => import('./CompetitionsPage'));
const AchievementsPage = lazy(() => import('./AchievementsPage'));

const perm = ['innovation.read'];

/**
 * Student Innovation Lab screens. Teachers see only projects of students in their scope
 * (enforced by the API).
 */
export const routes: AppRoute[] = [
  { path: '/innovation', perm, element: <InnovationDashboardPage /> },
  { path: '/ideas', perm, element: <IdeasPage /> },
  { path: '/projects', perm, element: <ProjectsPage /> },
  { path: '/projects/:id', perm, element: <ProjectPage /> },
  { path: '/mentors', perm, element: <MentorsPage /> },
  { path: '/milestones', perm, element: <MilestonesPage /> },
  { path: '/competitions', perm, element: <CompetitionsPage /> },
  { path: '/achievements', perm, element: <AchievementsPage /> },
];
