import type { Request } from 'express';
import { many, one, query, tx } from '../config/db.js';
import { Where } from '../utils/sql.js';
import { likeTerm, limitOffset, orderBy, type Pagination } from '../utils/pagination.js';
import { badRequest, notFound } from '../utils/errors.js';
import { studentScope } from './access.service.js';
import { notifyGuardians } from './notification.service.js';
import { audit } from './audit.service.js';
import type { AuthUser } from '../types.js';

/** A location older than this is shown as "last known" rather than live. */
export const STALE_AFTER_MINUTES = 30;

export type LocationStatus = 'at_home' | 'in_transit' | 'at_school' | 'on_trip' | 'unknown';

export const LOCATION_STATUS_LABEL: Record<LocationStatus, string> = {
  at_home: 'At home',
  in_transit: 'In transit',
  at_school: 'At school',
  on_trip: 'On a school trip',
  unknown: 'Unknown',
};

/** Great-circle distance in metres. */
export function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CURRENT_SQL = `
  SELECT s.id AS "studentId", s.admission_no AS "admissionNo", s.full_name AS "fullName", s.photo_url AS "photoUrl",
         c.name AS grade, sec.name AS section, cp.short_name AS "campusName", cp.code AS "campusCode",
         cp.latitude AS "campusLatitude", cp.longitude AS "campusLongitude",
         COALESCE(tp.tracking_enabled, false) AS "trackingEnabled",
         COALESCE(tp.tracking_status, 'disabled') AS "trackingStatus",
         tp.device_type AS "deviceType", COALESCE(tp.is_sample_data, false) AS "isSampleData",
         l.location_id AS "locationId", l.latitude, l.longitude, l.accuracy,
         l.location_status AS "locationStatus", l.place_label AS "placeLabel", l.source,
         l.battery_pct AS "batteryPct", l.recorded_at AS "recordedAt",
         (l.recorded_at IS NULL OR l.recorded_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES})) AS "isStale"
    FROM students s
    JOIN campuses cp ON cp.id = s.campus_id
    LEFT JOIN sections sec ON sec.id = s.section_id
    LEFT JOIN classes c ON c.id = sec.class_id
    LEFT JOIN student_tracking_profiles tp ON tp.student_id = s.id
    LEFT JOIN student_current_locations l ON l.student_id = s.id`;

export async function getCurrentLocation(studentId: string) {
  const row = await one(`${CURRENT_SQL} WHERE s.id = $1 AND s.deleted_at IS NULL`, [studentId]);
  if (!row) throw notFound('Student not found', 'STUDENT_NOT_FOUND');
  return decorate(row);
}

function decorate(row: any) {
  const label = LOCATION_STATUS_LABEL[(row.locationStatus as LocationStatus) ?? 'unknown'] ?? 'Unknown';
  let displayStatus: string;
  if (!row.trackingEnabled || row.trackingStatus === 'disabled') displayStatus = 'Tracking Disabled';
  else if (row.trackingStatus === 'paused') displayStatus = 'Tracking Paused';
  else if (!row.recordedAt) displayStatus = 'No Location Yet';
  else if (row.isStale || row.trackingStatus === 'offline') displayStatus = 'Offline';
  else displayStatus = 'Tracking Active';
  return { ...row, locationStatusLabel: label, displayStatus };
}

export interface HistoryFilters {
  date?: string;      // YYYY-MM-DD (local school day)
  from?: string;      // ISO datetime or HH:MM (combined with date)
  to?: string;
  limit?: number;
}

/**
 * Location history, oldest first (the order a route is drawn in). Times are
 * interpreted in the school's timezone (Asia/Kolkata).
 */
export async function getHistory(studentId: string, f: HistoryFilters, opts: { maxDaysBack?: number } = {}) {
  const w = new Where();
  w.add('l.student_id = ?', studentId);
  if (f.date) {
    const fromTime = f.from && /^\d{2}:\d{2}$/.test(f.from) ? f.from : '00:00';
    const toTime = f.to && /^\d{2}:\d{2}$/.test(f.to) ? f.to : '23:59';
    w.add(`l.recorded_at >= (?::date + ?::time) AT TIME ZONE 'Asia/Kolkata'`, f.date, fromTime);
    w.add(`l.recorded_at <= (?::date + ?::time + interval '59 seconds') AT TIME ZONE 'Asia/Kolkata'`, f.date, toTime);
  } else {
    if (f.from) w.add('l.recorded_at >= ?::timestamptz', f.from);
    if (f.to) w.add('l.recorded_at <= ?::timestamptz', f.to);
  }
  if (opts.maxDaysBack != null) w.add('l.recorded_at >= now() - make_interval(days => ?)', opts.maxDaysBack);
  const limit = Math.min(Math.max(f.limit ?? 500, 1), 2000);
  const points = await many(
    `SELECT * FROM (
       SELECT l.id, l.latitude, l.longitude, l.accuracy, l.location_status AS "locationStatus",
              l.place_label AS "placeLabel", l.source, l.battery_pct AS "batteryPct", l.recorded_at AS "recordedAt"
         FROM student_locations l ${w.sql}
        ORDER BY l.recorded_at DESC LIMIT ${w.param(limit)}) x
      ORDER BY x."recordedAt" ASC`,
    w.params,
  );
  const days = await many(
    `SELECT to_char(recorded_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date, count(*)::int AS points
       FROM student_locations WHERE student_id = $1
       ${opts.maxDaysBack != null ? `AND recorded_at >= now() - make_interval(days => ${Number(opts.maxDaysBack)})` : ''}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 31`,
    [studentId],
  );
  let distanceMetres = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMetres += haversineMetres(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
  }
  return {
    points: points.map((p) => ({ ...p, locationStatusLabel: LOCATION_STATUS_LABEL[p.locationStatus as LocationStatus] })),
    availableDays: days,
    summary: {
      count: points.length,
      first: points[0]?.recordedAt ?? null,
      last: points[points.length - 1]?.recordedAt ?? null,
      distanceKm: Math.round(distanceMetres / 10) / 100,
    },
  };
}

/** Works out where a coordinate is, using campus and bus-stop geofences. */
async function classify(studentId: string, lat: number, lng: number): Promise<{ status: LocationStatus; label: string | null }> {
  const zones = await many<{ name: string; latitude: number; longitude: number; radius_m: number }>(
    `SELECT name, latitude, longitude, radius_m FROM geofences WHERE zone_type = 'campus'`,
  );
  // The student's bus stop stands in for "home" until a home geofence is registered.
  const home = await one<{ latitude: number; longitude: number; name: string }>(
    `SELECT rs.latitude, rs.longitude, rs.name FROM student_transport st JOIN route_stops rs ON rs.id = st.stop_id WHERE st.student_id = $1`,
    [studentId],
  );
  for (const z of zones) {
    if (haversineMetres(lat, lng, z.latitude, z.longitude) <= z.radius_m) return { status: 'at_school', label: z.name };
  }
  if (home && haversineMetres(lat, lng, home.latitude, home.longitude) <= 250) return { status: 'at_home', label: `Near ${home.name}` };
  return { status: 'in_transit', label: null };
}

export interface LocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationStatus?: LocationStatus;
  placeLabel?: string;
  source?: 'device' | 'bus' | 'gate' | 'manual' | 'sample';
  batteryPct?: number;
  recordedAt?: string;
}

export async function recordLocation(req: Request, studentId: string, input: LocationInput) {
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  if (recordedAt.getTime() > Date.now() + 5 * 60_000) throw badRequest('recordedAt cannot be in the future', 'INVALID_TIMESTAMP');

  const profile = await one<{ tracking_enabled: boolean; tracking_status: string }>(
    'SELECT tracking_enabled, tracking_status FROM student_tracking_profiles WHERE student_id = $1',
    [studentId],
  );
  if (!profile || !profile.tracking_enabled || profile.tracking_status === 'disabled') {
    throw badRequest('Tracking is not enabled for this student', 'TRACKING_DISABLED');
  }

  const auto = input.locationStatus ? null : await classify(studentId, input.latitude, input.longitude);
  const status = input.locationStatus ?? auto!.status;
  const label = input.placeLabel ?? auto?.label ?? null;

  return tx(async (db) => {
    const prev = await one<{ location_status: LocationStatus }>(
      'SELECT location_status FROM student_current_locations WHERE student_id = $1',
      [studentId], db,
    );
    const row = await one(
      `INSERT INTO student_locations (student_id, latitude, longitude, accuracy, location_status, place_label, source, battery_pct, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, latitude, longitude, accuracy, location_status AS "locationStatus", place_label AS "placeLabel",
                 source, battery_pct AS "batteryPct", recorded_at AS "recordedAt"`,
      [studentId, input.latitude, input.longitude, input.accuracy ?? null, status, label, input.source ?? 'device', input.batteryPct ?? null, recordedAt],
      db,
    );
    await query(
      `UPDATE student_tracking_profiles SET tracking_status = 'active' WHERE student_id = $1 AND tracking_status = 'offline'`,
      [studentId], db,
    );

    // Parents hear about arrivals and departures, not every GPS ping.
    if (prev && prev.location_status !== status && (status === 'at_school' || prev.location_status === 'at_school')) {
      const s = await one<{ full_name: string }>('SELECT full_name FROM students WHERE id = $1', [studentId], db);
      const arrived = status === 'at_school';
      await notifyGuardians(studentId, {
        category: arrived ? 'Completed' : 'Information',
        icon: arrived ? 'shieldCheck' : 'mapPin',
        topic: 'tracking',
        title: arrived ? `${s!.full_name} reached the school campus` : `${s!.full_name} has left the school campus`,
        body: `Location updated at ${recordedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`,
        route: `/parent-360/track/${studentId}`,
        entityType: 'student',
        entityId: studentId,
      }, db);
    }
    await audit(req, {
      action: 'create', module: 'tracking', description: 'Recorded student location',
      entityType: 'student', entityId: studentId, metadata: { status, source: input.source ?? 'device' },
    }, db);
    return { ...row, locationStatusLabel: LOCATION_STATUS_LABEL[status] };
  });
}

export interface TrackingFilters extends Pagination {
  campusId?: string;
  classId?: string;
  sectionId?: string;
  status?: 'active' | 'paused' | 'offline' | 'disabled';
  locationStatus?: LocationStatus;
}

const TRACK_SORTS: Record<string, string> = {
  name: 'q."fullName"',
  grade: 'q.grade, q.section',
  status: 'q."trackingStatus"',
  updated: 'q."recordedAt"',
};

function trackingWhere(user: AuthUser, f: Partial<TrackingFilters>) {
  const w = new Where();
  w.add("s.deleted_at IS NULL AND s.status = 'active'");
  studentScope(user, w);
  w.addIf(f.campusId, 's.campus_id = ?');
  w.addIf(f.sectionId, 's.section_id = ?');
  w.addIf(f.classId, 'sec.class_id = ?');
  w.addIf(f.locationStatus, 'l.location_status = ?');
  if (f.status === 'offline') {
    w.add(`COALESCE(tp.tracking_status, 'disabled') IN ('active', 'offline') AND (l.recorded_at IS NULL OR l.recorded_at < now() - make_interval(mins => ${STALE_AFTER_MINUTES}) OR tp.tracking_status = 'offline')`);
  } else if (f.status === 'active') {
    w.add(`tp.tracking_status = 'active' AND tp.tracking_enabled AND l.recorded_at >= now() - make_interval(mins => ${STALE_AFTER_MINUTES})`);
  } else if (f.status) {
    w.add(`COALESCE(tp.tracking_status, 'disabled') = ?`, f.status);
  }
  if (f.q) w.add('(s.full_name ILIKE ? OR s.admission_no ILIKE ?)', likeTerm(f.q), likeTerm(f.q));
  return w;
}

export async function listTrackedStudents(user: AuthUser, f: TrackingFilters) {
  const w = trackingWhere(user, f);
  const { limit, offset } = limitOffset(f);
  const rows = await many(
    `SELECT q.*, count(*) OVER() AS total FROM (${CURRENT_SQL} ${w.sql}) q
      ORDER BY ${orderBy(f.sort, f.dir, TRACK_SORTS, 'name')}, q."fullName"
      LIMIT ${w.param(limit)} OFFSET ${w.param(offset)}`,
    w.params,
  );
  return { rows: rows.map(({ total: _t, ...r }) => decorate(r)), total: rows[0]?.total ?? 0 };
}

/** Everything the admin map needs in one call: markers, campuses, counts. */
export async function mapData(user: AuthUser, f: Partial<TrackingFilters>) {
  const w = trackingWhere(user, f);
  const rows = (await many(`${CURRENT_SQL} ${w.sql} ORDER BY s.full_name LIMIT 2000`, w.params)).map(decorate);
  const markers = rows
    .filter((r) => r.latitude != null && r.trackingEnabled)
    .map((r) => ({
      studentId: r.studentId, admissionNo: r.admissionNo, fullName: r.fullName, grade: r.grade, section: r.section,
      latitude: r.latitude, longitude: r.longitude, accuracy: r.accuracy, locationStatus: r.locationStatus,
      locationStatusLabel: r.locationStatusLabel, displayStatus: r.displayStatus, recordedAt: r.recordedAt, isStale: r.isStale,
    }));
  const campuses = await many(
    `SELECT c.id, c.code, c.name, c.short_name AS "shortName", c.latitude, c.longitude, g.radius_m AS "radiusM"
       FROM campuses c LEFT JOIN geofences g ON g.campus_id = c.id AND g.zone_type = 'campus'
      WHERE c.is_active ${f.campusId ? 'AND c.id = $1' : ''} ORDER BY c.name`,
    f.campusId ? [f.campusId] : [],
  );
  const summary = {
    total: rows.length,
    active: rows.filter((r) => r.displayStatus === 'Tracking Active').length,
    offline: rows.filter((r) => r.displayStatus === 'Offline' || r.displayStatus === 'No Location Yet').length,
    paused: rows.filter((r) => r.displayStatus === 'Tracking Paused').length,
    disabled: rows.filter((r) => r.displayStatus === 'Tracking Disabled').length,
    atSchool: rows.filter((r) => r.locationStatus === 'at_school' && !r.isStale).length,
    inTransit: rows.filter((r) => r.locationStatus === 'in_transit' && !r.isStale).length,
    atHome: rows.filter((r) => r.locationStatus === 'at_home' && !r.isStale).length,
  };
  return { markers, campuses, summary, staleAfterMinutes: STALE_AFTER_MINUTES, generatedAt: new Date().toISOString() };
}

export async function updateTrackingProfile(req: Request, studentId: string, input: { trackingEnabled?: boolean; trackingStatus?: string; deviceId?: string | null }) {
  const row = await one(
    `INSERT INTO student_tracking_profiles (student_id, tracking_enabled, tracking_status, device_id)
     VALUES ($1, COALESCE($2, true), COALESCE($3, 'active'), $4)
     ON CONFLICT (student_id) DO UPDATE SET
       tracking_enabled = COALESCE($2, student_tracking_profiles.tracking_enabled),
       tracking_status  = COALESCE($3, CASE WHEN $2 = false THEN 'disabled' WHEN $2 = true AND student_tracking_profiles.tracking_status = 'disabled' THEN 'active' ELSE student_tracking_profiles.tracking_status END),
       device_id        = COALESCE($4, student_tracking_profiles.device_id)
     RETURNING tracking_enabled AS "trackingEnabled", tracking_status AS "trackingStatus", device_id AS "deviceId"`,
    [studentId, input.trackingEnabled ?? null, input.trackingStatus ?? null, input.deviceId ?? null],
  );
  await audit(req, {
    action: 'update', module: 'tracking',
    description: `Changed tracking settings (${row.trackingEnabled ? 'enabled' : 'disabled'}, ${row.trackingStatus})`,
    entityType: 'student', entityId: studentId, metadata: input,
  });
  return row;
}

/** Headline figures for dashboards. */
export async function trackingSummary(user: AuthUser, campusId?: string) {
  return (await mapData(user, { campusId })).summary;
}
