import type { Request } from 'express';
import { many, one, query, tx, type Queryable } from '../config/db.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { notifyUsers } from './notification.service.js';
import {
  authorizeSection, isRestricted, isoDow, requireSchoolScope, schoolMinutesNow, schoolToday,
} from './academics.service.js';
import { DAY_NAMES } from './academics-shared.js';
import type { AuthUser } from '../types.js';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ENTRY_SQL = `
  SELECT te.id, te.section_id AS "sectionId", c.name || sec.name AS "sectionLabel", te.day_of_week AS day,
         p.period_no AS "periodNo", to_char(p.starts_at, 'HH24:MI') AS "startsAt", to_char(p.ends_at, 'HH24:MI') AS "endsAt",
         te.subject_id AS "subjectId", sub.name AS subject, sub.code AS "subjectCode", te.activity,
         te.employee_id AS "employeeId", e.full_name AS teacher,
         te.substitute_id AS "substituteId", se.full_name AS substitute,
         te.room, te.needs_substitute AS "needsSubstitute"
    FROM timetable_entries te
    JOIN periods p ON p.id = te.period_id
    JOIN sections sec ON sec.id = te.section_id
    JOIN classes c ON c.id = sec.class_id
    LEFT JOIN subjects sub ON sub.id = te.subject_id
    LEFT JOIN employees e ON e.id = te.employee_id
    LEFT JOIN employees se ON se.id = te.substitute_id`;

// =============================================================================
// Teacher dashboard
// =============================================================================
export async function teacherDashboard(user: AuthUser) {
  const today = schoolToday();
  const dow = isoDow(today);
  const nowMin = schoolMinutesNow();
  const me = user.employeeId;
  const tasks = await many(
    `SELECT t.id, t.code, t.title, t.module, t.due_on AS "dueOn", t.priority, t.status, t.route, (t.due_on < current_date) AS overdue
       FROM tasks t
      WHERE (t.assignee_user_id = $1 OR t.assignee_role_key = $2) AND t.status IN ('Pending', 'Under Review')
      ORDER BY t.due_on NULLS LAST, array_position(ARRAY['High','Medium','Low'], t.priority) LIMIT 5`,
    [user.id, user.roleKey],
  );
  const base = { date: today, dayName: DAY_NAMES[dow - 1] ?? 'Sunday', tasks };
  if (!me) {
    return { ...base, employee: null, classes: [], today: [], watchlist: [], watchCount: 0, homework: [], kpis: null, lede: 'Your account is not linked to a staff record, so there are no classes to show.' };
  }

  const [employee, sections, week, pendingMarks, watchlist, watchCount, homework] = await Promise.all([
    one(`SELECT id, full_name AS "fullName", designation, campus_id AS "campusId" FROM employees WHERE id = $1`, [me]),
    many(
      `WITH mine AS (
         SELECT ta.section_id FROM teacher_assignments ta WHERE ta.employee_id = $1 AND ta.academic_year_id = (SELECT id FROM academic_years WHERE is_current)
         UNION SELECT id FROM sections WHERE class_teacher_id = $1 AND academic_year_id = (SELECT id FROM academic_years WHERE is_current))
       SELECT sec.id, c.name || sec.name AS name, c.grade_level AS "gradeLevel",
              COALESCE((SELECT string_agg(DISTINCT sub.name, ', ') FROM teacher_assignments ta JOIN subjects sub ON sub.id = ta.subject_id
                         WHERE ta.section_id = sec.id AND ta.employee_id = $1), 'Class teacher') AS subject,
              (sec.class_teacher_id = $1) AS "isClassTeacher", sec.room,
              (SELECT count(*)::int FROM students s WHERE s.section_id = sec.id AND s.deleted_at IS NULL AND s.status = 'active') AS students,
              (SELECT count(*)::int FROM attendance_records a JOIN students s ON s.id = a.student_id AND s.deleted_at IS NULL AND s.status = 'active'
                WHERE a.section_id = sec.id AND a.attendance_date = $2) AS marked
         FROM sections sec JOIN classes c ON c.id = sec.class_id
        WHERE sec.id IN (SELECT section_id FROM mine)
        ORDER BY c.grade_level, sec.name`,
      [me, today],
    ),
    many(`${ENTRY_SQL} WHERE (te.employee_id = $1 AND te.substitute_id IS NULL) OR te.substitute_id = $1 ORDER BY te.day_of_week, p.period_no`, [me]),
    many(
      `SELECT a.id, a.code, a.name, a.status, a.held_on AS "heldOn",
              (SELECT count(*)::int FROM students s WHERE s.deleted_at IS NULL AND s.status = 'active'
                 AND s.section_id IN (SELECT ta.section_id FROM teacher_assignments ta WHERE ta.employee_id = $1 AND ta.subject_id = a.subject_id)
                 AND (a.section_id IS NULL AND s.section_id IN (SELECT id FROM sections WHERE class_id = a.class_id) OR s.section_id = a.section_id)) AS roster,
              (SELECT count(*)::int FROM assessment_marks m JOIN students s ON s.id = m.student_id
                WHERE m.assessment_id = a.id AND (m.marks IS NOT NULL OR m.is_absent)
                  AND s.section_id IN (SELECT ta.section_id FROM teacher_assignments ta WHERE ta.employee_id = $1 AND ta.subject_id = a.subject_id)) AS entered
         FROM assessments a
        WHERE a.status IN ('Scheduled', 'In Progress') AND a.held_on <= $2
          AND a.academic_year_id = (SELECT id FROM academic_years WHERE is_current)
          AND EXISTS (SELECT 1 FROM teacher_assignments ta JOIN sections sx ON sx.id = ta.section_id
                       WHERE ta.employee_id = $1 AND ta.subject_id = a.subject_id AND sx.class_id = a.class_id
                         AND (a.section_id IS NULL OR a.section_id = ta.section_id))`,
      [me, today],
    ),
    many(
      `SELECT w.id, w.code, w.signal, w.signal_type AS "signalType", w.stage, w.raised_on AS "raisedOn",
              s.id AS "studentId", s.full_name AS name, s.admission_no AS "admissionNo", c.name || sec.name AS "sectionLabel"
         FROM early_warning_signals w
         JOIN students s ON s.id = w.student_id AND s.deleted_at IS NULL
         JOIN sections sec ON sec.id = s.section_id JOIN classes c ON c.id = sec.class_id
        WHERE w.closed_at IS NULL AND COALESCE(w.review_decision, '') <> 'dismissed'
          AND s.section_id IN (SELECT ta.section_id FROM teacher_assignments ta WHERE ta.employee_id = $1 UNION SELECT id FROM sections WHERE class_teacher_id = $1)
        ORDER BY (w.signal_type = 'attendance') DESC, w.raised_on DESC LIMIT 6`,
      [me],
    ),
    one<{ n: number }>(
      `SELECT count(*)::int AS n FROM early_warning_signals w JOIN students s ON s.id = w.student_id AND s.deleted_at IS NULL
        WHERE w.closed_at IS NULL AND COALESCE(w.review_decision, '') <> 'dismissed'
          AND s.section_id IN (SELECT ta.section_id FROM teacher_assignments ta WHERE ta.employee_id = $1 UNION SELECT id FROM sections WHERE class_teacher_id = $1)`,
      [me],
    ),
    many(
      `SELECT h.id, h.title, sub.name AS subject, c.name || sec.name AS "sectionLabel", h.due_on AS "dueOn", h.status,
              (SELECT count(*)::int FROM homework_submissions hs WHERE hs.homework_id = h.id) AS submitted,
              (SELECT count(*)::int FROM students s WHERE s.section_id = h.section_id AND s.deleted_at IS NULL AND s.status = 'active') AS "of"
         FROM homework h JOIN subjects sub ON sub.id = h.subject_id
         JOIN sections sec ON sec.id = h.section_id JOIN classes c ON c.id = sec.class_id
        WHERE h.status = 'Open'
          AND (h.assigned_by = $1 OR h.section_id IN (SELECT id FROM sections WHERE class_teacher_id = $1))
        ORDER BY (h.section_id IN (SELECT id FROM sections WHERE class_teacher_id = $1)) DESC, h.due_on LIMIT 6`,
      [me],
    ),
  ]);

  // Today's periods (teaching + cover), with free periods between them.
  const todays = week.filter((e) => e.day === dow);
  const periods = await many<{ periodNo: number; startsAt: string; endsAt: string }>(
    `SELECT period_no AS "periodNo", to_char(starts_at, 'HH24:MI') AS "startsAt", to_char(ends_at, 'HH24:MI') AS "endsAt"
       FROM periods WHERE campus_id = $1 ORDER BY period_no`,
    [employee?.campusId],
  );
  const todayList: Record<string, unknown>[] = [];
  if (todays.length) {
    const first = todays[0].periodNo;
    const last = todays[todays.length - 1].periodNo;
    for (const p of periods.filter((x) => x.periodNo >= first && x.periodNo <= last)) {
      const e = todays.find((t) => t.periodNo === p.periodNo);
      const state = toMin(p.startsAt) <= nowMin && nowMin < toMin(p.endsAt) ? 'now' : toMin(p.endsAt) <= nowMin ? 'done' : 'upcoming';
      todayList.push(e
        ? { periodNo: p.periodNo, startsAt: p.startsAt, endsAt: p.endsAt, what: `${e.sectionLabel} ${e.subject ?? e.activity ?? ''}`.trim(), where: e.room ?? '—', sectionId: e.sectionId, cover: e.substituteId === me, state }
        : { periodNo: p.periodNo, startsAt: p.startsAt, endsAt: p.endsAt, what: 'Free period', where: 'Staff room', free: true, state });
    }
  }

  // Next lesson per section (today after now, else the next school day).
  const nextFor = (sectionId: string) => {
    const later = week.filter((e) => e.sectionId === sectionId);
    const t = later.find((e) => e.day === dow && toMin(e.endsAt) > nowMin);
    if (t) return { label: `Period ${t.periodNo} · ${t.startsAt}`, today: true };
    for (let k = 1; k <= 6; k++) {
      const d = ((dow - 1 + k) % 7) + 1;
      const n = later.find((e) => e.day === d);
      if (n) return { label: k === 1 ? `Tomorrow · P${n.periodNo}` : `${DAY_NAMES[d - 1]} · P${n.periodNo}`, today: false };
    }
    return { label: 'Not timetabled', today: false };
  };
  const classes = sections.map((s) => {
    const hasToday = todays.some((e) => e.sectionId === s.id);
    const next = nextFor(s.id);
    const attendance = s.students === 0 ? '—' : s.marked >= s.students ? 'Marked' : s.marked > 0 ? 'Pending' : hasToday || s.isClassTeacher ? 'Not marked' : '—';
    return { ...s, next: next.label, hasClassToday: hasToday, attendance };
  });
  const toMark = classes.filter((c) => c.attendance === 'Not marked' || c.attendance === 'Pending');
  const pending = pendingMarks.map((a) => ({ ...a, pending: Math.max(0, a.roster - a.entered) })).filter((a) => a.pending > 0);
  const pendingTotal = pending.reduce((a, x) => a + x.pending, 0);
  const teachingToday = new Set(todays.map((e) => e.sectionId)).size;
  return {
    ...base,
    employee,
    lede: `${teachingToday === 0 ? 'No classes' : teachingToday === 1 ? 'One class' : `${teachingToday} classes`} today. ${toMark.length === 0 ? 'Every register is up to date.' : toMark.length === 1 ? 'One is waiting on attendance.' : `${toMark.length} are waiting on attendance.`}`,
    kpis: {
      classes: classes.length,
      students: classes.reduce((a, c) => a + c.students, 0),
      toMark: toMark.length,
      toMarkNames: toMark.map((c) => c.name),
      marksPending: pendingTotal,
      marksPendingFoot: pending.sort((a, b) => b.pending - a.pending)[0]?.name ?? null,
      watch: watchCount?.n ?? 0,
    },
    classes,
    today: todayList,
    watchlist,
    watchCount: watchCount?.n ?? 0,
    homework,
  };
}

// =============================================================================
// Timetable
// =============================================================================
export async function getTimetable(user: AuthUser, f: { sectionId?: string; employeeId?: string }) {
  let campusId: string;
  let entries;
  let title: string;
  if (f.sectionId) {
    const sec = await authorizeSection(user, f.sectionId);
    campusId = sec.campusId;
    title = sec.label;
    entries = await many(`${ENTRY_SQL} WHERE te.section_id = $1 ORDER BY te.day_of_week, p.period_no`, [sec.id]);
  } else {
    const emp = f.employeeId ?? user.employeeId;
    if (!emp) throw badRequest('Choose a section', 'SECTION_REQUIRED');
    if (isRestricted(user) && emp !== user.employeeId) throw notFound('Timetable not found');
    const e = await one<{ campus_id: string; full_name: string }>('SELECT campus_id, full_name FROM employees WHERE id = $1 AND deleted_at IS NULL', [emp]);
    if (!e) throw notFound('Teacher not found');
    campusId = e.campus_id;
    title = e.full_name;
    entries = await many(`${ENTRY_SQL} WHERE te.employee_id = $1 OR te.substitute_id = $1 ORDER BY te.day_of_week, p.period_no`, [emp]);
  }
  const periods = await many(
    `SELECT id, period_no AS "periodNo", to_char(starts_at, 'HH24:MI') AS "startsAt", to_char(ends_at, 'HH24:MI') AS "endsAt"
       FROM periods WHERE campus_id = $1 ORDER BY period_no`,
    [campusId],
  );
  const today = schoolToday();
  const conflicts = entries.filter((e) => e.needsSubstitute && !e.substituteId);
  const conflictDetails = await Promise.all(conflicts.map(async (e) => ({
    ...e,
    teacherStatus: e.employeeId ? await teacherStatusOn(e.employeeId, dateForDay(today, e.day)) : null,
    date: dateForDay(today, e.day),
  })));
  const maxDay = entries.reduce((m, e) => Math.max(m, e.day), 5);
  return {
    title,
    campusId,
    days: DAY_NAMES.slice(0, maxDay),
    periods,
    entries,
    conflicts: conflictDetails,
    today: { date: today, day: isoDow(today) },
  };
}

/** The date of the given weekday in the current week (or next week once it has passed). */
function dateForDay(today: string, day: number) {
  const diff = day - isoDow(today);
  return addDays(today, diff >= 0 ? diff : diff + 7);
}

async function teacherStatusOn(employeeId: string, date: string, db?: Queryable) {
  const r = await one<{ status: string | null; leave: string | null }>(
    `SELECT (SELECT status FROM staff_attendance WHERE employee_id = $1 AND attendance_date = $2) AS status,
            (SELECT lr.code FROM leave_requests lr WHERE lr.employee_id = $1 AND lr.status = 'Approved' AND $2::date BETWEEN lr.from_date AND lr.to_date LIMIT 1) AS leave`,
    [employeeId, date], db,
  );
  if (r?.leave) return `On approved leave (${r.leave})`;
  if (r?.status === 'On Leave') return 'On leave';
  if (r?.status === 'Absent') return 'Absent';
  return r?.status ?? null;
}

export async function timetableInsights(user: AuthUser, campusId?: string) {
  const c = campusId ?? user.campusId ?? null;
  const [load, util] = await Promise.all([
    many(
      `SELECT e.id, e.full_name AS name, count(*)::int AS periods, COALESCE(t.max_periods_week, 30) AS "maxPeriods"
         FROM timetable_entries te
         JOIN employees e ON e.id = COALESCE(te.substitute_id, te.employee_id)
         LEFT JOIN teachers t ON t.employee_id = e.id
        WHERE ($1::uuid IS NULL OR e.campus_id = $1) AND e.employee_type = 'teaching'
        GROUP BY e.id, e.full_name, t.max_periods_week
        ORDER BY count(*) DESC, e.full_name LIMIT 8`,
      [c],
    ),
    one(
      `SELECT count(*)::int AS filled,
              (count(DISTINCT te.section_id) * 5 * (SELECT count(*) FROM periods p WHERE $1::uuid IS NULL OR p.campus_id = $1)
                / GREATEST(1, (SELECT count(DISTINCT campus_id) FROM periods p WHERE $1::uuid IS NULL OR p.campus_id = $1)))::int AS slots
         FROM timetable_entries te JOIN sections sec ON sec.id = te.section_id JOIN classes cl ON cl.id = sec.class_id
        WHERE ($1::uuid IS NULL OR cl.campus_id = $1) AND te.day_of_week <= 5`,
      [c],
    ),
  ]);
  const agreed = load.length ? Math.min(...load.map((l) => l.maxPeriods)) : 30;
  return {
    teacherLoad: load,
    agreedLoad: agreed,
    utilisation: { filled: util?.filled ?? 0, slots: util?.slots ?? 0, pct: util?.slots ? Math.round((100 * util.filled) / util.slots) : 0 },
  };
}

async function loadEntry(id: string, db?: Queryable) {
  const e = await one(
    `SELECT te.*, p.period_no, c.campus_id, c.name || sec.name AS section_label, sub.name AS subject_name
       FROM timetable_entries te JOIN periods p ON p.id = te.period_id
       JOIN sections sec ON sec.id = te.section_id JOIN classes c ON c.id = sec.class_id
       LEFT JOIN subjects sub ON sub.id = te.subject_id
      WHERE te.id = $1`,
    [id], db,
  );
  if (!e) throw notFound('Timetable entry not found');
  return e;
}

/** Teachers who are free and present for this slot, best match first. */
export async function substituteSuggestions(user: AuthUser, entryId: string) {
  const e = await loadEntry(entryId);
  await authorizeSection(user, e.section_id);
  const date = dateForDay(schoolToday(), e.day_of_week);
  const rows = await many(
    `SELECT emp.id, emp.full_name AS name, emp.designation, emp.user_id IS NOT NULL AS "hasAccount",
            EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.employee_id = emp.id AND ta.subject_id = $4) AS "teachesSubject",
            EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.employee_id = emp.id AND ta.section_id = $5) AS "teachesSection",
            (SELECT count(*)::int FROM timetable_entries x WHERE (x.employee_id = emp.id AND x.substitute_id IS NULL) OR x.substitute_id = emp.id) AS load,
            (SELECT string_agg(DISTINCT sub.name, ', ') FROM teacher_assignments ta JOIN subjects sub ON sub.id = ta.subject_id WHERE ta.employee_id = emp.id) AS subjects
       FROM employees emp
      WHERE emp.employee_type = 'teaching' AND emp.deleted_at IS NULL AND emp.employment_status = 'active'
        AND emp.campus_id = $1 AND emp.id IS DISTINCT FROM $6
        AND NOT EXISTS (SELECT 1 FROM timetable_entries x JOIN periods px ON px.id = x.period_id
                         WHERE x.day_of_week = $2 AND px.period_no = $3
                           AND ((x.employee_id = emp.id AND x.substitute_id IS NULL AND NOT x.needs_substitute) OR x.substitute_id = emp.id))
        AND NOT EXISTS (SELECT 1 FROM staff_attendance sa WHERE sa.employee_id = emp.id AND sa.attendance_date = $7 AND sa.status IN ('Absent', 'On Leave'))
        AND NOT EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.employee_id = emp.id AND lr.status = 'Approved' AND $7::date BETWEEN lr.from_date AND lr.to_date)`,
    [e.campus_id, e.day_of_week, e.period_no, e.subject_id, e.section_id, e.employee_id, date],
  );
  const ranked = rows
    .map((r) => ({
      ...r,
      score: (r.teachesSubject ? 3 : 0) + (r.teachesSection ? 2 : 0) - r.load / 40,
      reason: [
        `Free P${e.period_no}`,
        r.subjects ? `teaches ${r.subjects}` : r.designation,
        r.teachesSection ? `already teaches ${e.section_label}` : null,
        `${r.load} periods this week`,
      ].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return {
    entry: {
      id: e.id, day: DAY_NAMES[e.day_of_week - 1], date, periodNo: e.period_no, section: e.section_label,
      subject: e.subject_name ?? e.activity, room: e.room,
      teacherStatus: e.employee_id ? await teacherStatusOn(e.employee_id, date) : null,
    },
    suggestions: ranked.map(({ score, ...r }) => ({ ...r, match: score >= 3 ? 'success' : score >= 1 ? 'info' : 'neutral' })),
  };
}

export async function assignSubstitute(req: Request, entryId: string, substituteId: string, note?: string | null) {
  return tx(async (db) => {
    const e = await loadEntry(entryId, db);
    await authorizeSection(req.user!, e.section_id, db);
    if (substituteId === e.employee_id) throw badRequest('The substitute must be a different teacher', 'SAME_TEACHER');
    const date = dateForDay(schoolToday(), e.day_of_week);
    const sub = await one<{ full_name: string; user_id: string | null; campus_id: string }>(
      `SELECT full_name, user_id, campus_id FROM employees WHERE id = $1 AND employee_type = 'teaching' AND deleted_at IS NULL AND employment_status = 'active'`,
      [substituteId], db,
    );
    if (!sub || sub.campus_id !== e.campus_id) throw badRequest('Choose an active teacher from the same campus', 'INVALID_SUBSTITUTE');
    const busy = await one(
      `SELECT c.name || sec.name AS label FROM timetable_entries x JOIN periods px ON px.id = x.period_id
         JOIN sections sec ON sec.id = x.section_id JOIN classes c ON c.id = sec.class_id
        WHERE x.id <> $1 AND x.day_of_week = $2 AND px.period_no = $3
          AND ((x.employee_id = $4 AND x.substitute_id IS NULL AND NOT x.needs_substitute) OR x.substitute_id = $4) LIMIT 1`,
      [entryId, e.day_of_week, e.period_no, substituteId], db,
    );
    if (busy) throw badRequest(`${sub.full_name} is teaching ${busy.label} in that period`, 'TEACHER_BUSY');
    const status = await teacherStatusOn(substituteId, date, db);
    if (status && /leave|Absent/i.test(status)) throw badRequest(`${sub.full_name} is not available on ${date} (${status})`, 'TEACHER_UNAVAILABLE');

    await query(`UPDATE timetable_entries SET substitute_id = $2, needs_substitute = false WHERE id = $1`, [entryId, substituteId], db);
    const what = `${e.section_label} ${e.subject_name ?? e.activity ?? ''}`.trim();
    if (sub.user_id) {
      await notifyUsers([sub.user_id], {
        category: 'Attention', topic: 'timetable', icon: 'calendar',
        title: `Cover assigned: ${DAY_NAMES[e.day_of_week - 1]} Period ${e.period_no}`,
        body: `${what} · ${e.room ?? ''}${note ? ` — ${note}` : ''}`.trim(),
        route: '/timetable', entityType: 'timetable_entry', entityId: entryId,
      }, db);
    }
    await audit(req, {
      action: 'update', module: 'academics',
      description: `Assigned ${sub.full_name} to cover ${what}, ${DAY_NAMES[e.day_of_week - 1]} P${e.period_no}`,
      entityType: 'timetable_entry', entityId: entryId, metadata: { substituteId, date, note },
    }, db);
    return { id: entryId, substitute: sub.full_name, date };
  });
}

export async function clearSubstitute(req: Request, entryId: string) {
  return tx(async (db) => {
    const e = await loadEntry(entryId, db);
    await authorizeSection(req.user!, e.section_id, db);
    if (!e.substitute_id) throw badRequest('No substitute is assigned to this period', 'NO_SUBSTITUTE');
    await query(`UPDATE timetable_entries SET substitute_id = NULL, needs_substitute = true WHERE id = $1`, [entryId], db);
    await audit(req, { action: 'update', module: 'academics', description: `Removed cover from ${e.section_label}, ${DAY_NAMES[e.day_of_week - 1]} P${e.period_no}`, entityType: 'timetable_entry', entityId: entryId }, db);
    return { id: entryId };
  });
}

export async function updateEntry(req: Request, entryId: string, input: { subjectId?: string | null; activity?: string | null; employeeId?: string | null; room?: string | null; needsSubstitute?: boolean }) {
  requireSchoolScope(req.user!, 'Editing the timetable');
  return tx(async (db) => {
    const e = await loadEntry(entryId, db);
    const subjectId = input.subjectId !== undefined ? input.subjectId : e.subject_id;
    const activity = input.activity !== undefined ? input.activity : e.activity;
    if (!subjectId && !activity) throw badRequest('Choose a subject or enter an activity', 'VALIDATION_ERROR', [{ field: 'subjectId', message: 'Choose a subject or enter an activity' }]);
    const employeeId = input.employeeId !== undefined ? input.employeeId : e.employee_id;
    if (employeeId && employeeId !== e.employee_id) {
      const clash = await one(
        `SELECT c.name || sec.name AS label FROM timetable_entries x JOIN periods px ON px.id = x.period_id
           JOIN sections sec ON sec.id = x.section_id JOIN classes c ON c.id = sec.class_id
          WHERE x.id <> $1 AND x.day_of_week = $2 AND px.period_no = $3 AND (x.employee_id = $4 OR x.substitute_id = $4) LIMIT 1`,
        [entryId, e.day_of_week, e.period_no, employeeId], db,
      );
      if (clash) throw badRequest(`That teacher already has ${clash.label} in this period`, 'TEACHER_BUSY');
    }
    await query(
      `UPDATE timetable_entries SET subject_id = $2, activity = $3, employee_id = $4, room = $5, needs_substitute = $6,
              substitute_id = CASE WHEN $7 THEN NULL ELSE substitute_id END
        WHERE id = $1`,
      [entryId, subjectId, activity, employeeId, input.room !== undefined ? input.room : e.room,
        input.needsSubstitute ?? e.needs_substitute, employeeId !== e.employee_id], db,
    );
    await audit(req, { action: 'update', module: 'academics', description: `Edited timetable ${e.section_label}, ${DAY_NAMES[e.day_of_week - 1]} P${e.period_no}`, entityType: 'timetable_entry', entityId: entryId, metadata: input }, db);
    return { id: entryId };
  });
}

export async function publishTimetable(req: Request, sectionId: string, note?: string | null) {
  requireSchoolScope(req.user!, 'Publishing timetable changes');
  return tx(async (db) => {
    const sec = await authorizeSection(req.user!, sectionId, db);
    const users = await many<{ user_id: string }>(
      `SELECT DISTINCT e.user_id FROM timetable_entries te JOIN employees e ON e.id IN (te.employee_id, te.substitute_id)
        WHERE te.section_id = $1 AND e.user_id IS NOT NULL`,
      [sectionId], db,
    );
    await notifyUsers(users.map((u) => u.user_id), {
      category: 'Information', topic: 'timetable', icon: 'calendar',
      title: `Timetable updated — ${sec.label}`, body: note ?? 'Please check your periods for this week.', route: '/timetable',
      entityType: 'section', entityId: sectionId,
    }, db);
    await audit(req, { action: 'publish', module: 'academics', description: `Published timetable changes for ${sec.label}`, entityType: 'section', entityId: sectionId, metadata: { note, notified: users.length } }, db);
    return { notified: users.length };
  });
}
