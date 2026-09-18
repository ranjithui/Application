import { lazy } from 'react';
import type { AppRoute } from '../registry';

/**
 * academics screens. Each route declares the permissions that may open it (any of);
 * the API enforces the same rule. Paths and permissions match layouts/nav.ts.
 */
const TeacherDashboardPage = lazy(() => import('./TeacherDashboardPage'));
const AttendancePage = lazy(() => import('./AttendancePage'));
const AcademicPerformancePage = lazy(() => import('./AcademicPerformancePage'));
const AssessmentsPage = lazy(() => import('./AssessmentsPage'));
const CurriculumPage = lazy(() => import('./CurriculumPage'));
const ClassesPage = lazy(() => import('./ClassesPage'));
const SubjectsPage = lazy(() => import('./SubjectsPage'));
const TimetablePage = lazy(() => import('./TimetablePage'));
const LessonPlansPage = lazy(() => import('./LessonPlansPage'));
const HomeworkPage = lazy(() => import('./HomeworkPage'));
const QuestionBankPage = lazy(() => import('./QuestionBankPage'));
const ReportCardsPage = lazy(() => import('./ReportCardsPage'));
const ObjectivesPage = lazy(() => import('./ObjectivesPage'));

export const routes: AppRoute[] = [
  { path: '/teacher', perm: ['attendance.mark'], element: <TeacherDashboardPage /> },
  { path: '/attendance', perm: ['attendance.read'], element: <AttendancePage /> },
  { path: '/academic-performance', perm: ['students.read', 'students.read_assigned'], element: <AcademicPerformancePage /> },
  { path: '/assessments', perm: ['academics.read'], element: <AssessmentsPage /> },
  { path: '/curriculum', perm: ['academics.read'], element: <CurriculumPage /> },
  { path: '/classes', perm: ['academics.read'], element: <ClassesPage /> },
  { path: '/subjects', perm: ['academics.read'], element: <SubjectsPage /> },
  { path: '/timetable', perm: ['academics.read'], element: <TimetablePage /> },
  { path: '/lesson-plans', perm: ['academics.read'], element: <LessonPlansPage /> },
  { path: '/homework', perm: ['academics.read'], element: <HomeworkPage /> },
  { path: '/question-bank', perm: ['academics.read'], element: <QuestionBankPage /> },
  { path: '/report-cards', perm: ['academics.read'], element: <ReportCardsPage /> },
  { path: '/objectives', perm: ['academics.read'], element: <ObjectivesPage /> },
];
