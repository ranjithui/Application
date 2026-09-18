import { Router, type Request, type Response } from 'express';
import { many, one } from '../config/db.js';
import { env } from '../config/env.js';
import { ok } from '../utils/response.js';

/**
 * Unauthenticated configuration for the sign-in screen and mobile app bootstrap.
 * Contains nothing personal: school branding, campus names, public settings,
 * and — outside production only — the demo account emails for the role tiles.
 */
const r = Router();

r.get('/config', async (_req: Request, res: Response) => {
  const [campuses, year, settings, stats] = await Promise.all([
    many('SELECT code, name, short_name AS "shortName", place FROM campuses WHERE is_active ORDER BY established'),
    one('SELECT label FROM academic_years WHERE is_current'),
    many('SELECT key, value FROM system_settings WHERE is_public'),
    one(`SELECT (SELECT count(*) FROM students WHERE deleted_at IS NULL AND status = 'active')::int AS students,
                (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND employment_status = 'active')::int AS staff,
                (SELECT count(*) FROM campuses WHERE is_active)::int AS campuses`),
  ]);
  const data: Record<string, unknown> = {
    campuses,
    academicYear: year?.label ?? null,
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    stats,
    map: { tileUrl: env.MAP_TILE_URL, attribution: '© OpenStreetMap contributors', hasApiKey: !!env.MAP_API_KEY },
    environment: env.NODE_ENV,
  };
  if (!env.isProd) {
    data.demoAccounts = await many(
      `SELECT u.email, u.full_name AS "fullName", u.title, r.key AS role, r.name AS "roleName"
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.email LIKE '%.demo@%' AND u.deleted_at IS NULL ORDER BY array_position(
          ARRAY['principal','teacher','parent','office','staff','super_admin','school_admin','management','hr','finance','student'], r.key::text)`,
    );
  }
  return ok(res, data, 'Public configuration');
});

export default r;
