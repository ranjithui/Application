# Student GPS tracking

> In development every coordinate is **generated sample data** (`student_tracking_profiles.is_sample_data = true`,
> `student_locations.source = 'sample'`). No real child's location is stored.

## Data model

| Table / view | Purpose |
|---|---|
| `student_tracking_profiles` | One row per student: `tracking_enabled`, `tracking_status` (active / paused / offline / disabled), device type and id, who gave consent and when, sample flag. |
| `student_locations` | Append-only history: `latitude`, `longitude`, `accuracy` (m), `location_status` (at_home / in_transit / at_school / on_trip / unknown), `place_label`, `source` (device / bus / gate / manual / sample), `battery_pct`, `recorded_at`, `created_at`. Indexed on `(student_id, recorded_at DESC)`. |
| `student_current_locations` (view) | Latest row per student — used by maps, lists and dashboards. |
| `geofences` | Campus boundaries (350 m radius in the sample data); used to classify incoming points. |
| `route_stops`, `student_transport` | The student's bus stop, used as the "home" reference until home geofences are registered. |

A location older than **30 minutes** is shown as *last known* and the student counts as
**Offline** (`tracking.stale_after_minutes`).

## Recording locations

`POST /api/students/:id/location` (permission `tracking.write` — devices, bus units and
integrations use a service account holding it):

```json
{ "latitude": 11.0168, "longitude": 76.9558, "accuracy": 8, "batteryPct": 71, "recordedAt": "2026-09-17T05:02:00Z" }
```

- Rejected when tracking is disabled for the student, or `recordedAt` is in the future.
- `locationStatus` is optional; when omitted the API classifies the point: inside a campus
  geofence → `at_school`; within 250 m of the student's stop → `at_home`; otherwise `in_transit`.
- When a student arrives on or leaves campus, guardians receive an in-app notification
  (and queued WhatsApp/push) — not on every ping.
- Every write is audited.

## Who can see what

| Viewer | Current location | History | Endpoint(s) |
|---|---|---|---|
| Super Admin, School Admin, Principal, Management | all students | yes | `/students/:id/location`, `/students/:id/location/history`, `/tracking/*` |
| Office | all students | no | same, minus history |
| Teacher | students in their assigned sections | no | `/students/:id/location`, `/tracking/*` (scoped) |
| Parent | own children with `can_view_tracking` | last 7 days | `/parents/:parentId/children/:studentId/location[/history]` (also `/students/:id/location`, scoped) |
| Anyone else | — | — | 403 / 404 |

Every view is written to the audit trail ("Parent viewed child tracking", "Viewed tracking history", …).
Enabling, pausing or disabling tracking requires `tracking.manage` (Principal, Admins).

## Screens

### Student 360 → Student Tracking tab
Student name and ID, tracking status (● Tracking Active / Paused / Offline / Disabled),
current location on an interactive map with accuracy circle and campus geofence, latitude,
longitude, accuracy, last updated, battery, a link to OpenStreetMap, the **History** view
(for users with history access) and tracking controls (for `tracking.manage`).

### Safety & Transport → Student Tracking (CRM/Admin)
- KPI strip: students tracked live, on campus, in transit, offline.
- Search, class, section, tracking-status and location filters (kept in the URL).
- Map of all matching students (colour by location status, grey when stale) with campus
  markers and geofences; click a marker for a popup with *Open Student 360*.
- Student list: Student | Class | Status | Last Updated | Action (Track / Student 360), sortable and paginated.
- Views: map + list, map only, list only. Auto-refresh every 60 s.
- `/student-tracking/:id`: the tracking panel with **location history**.

### Location history
Date picker (plus a list of days that have data), from/to time filter, the day's path on
the map (start, recorded points, last known), total distance, point count, last known
location and a clickable timeline of points.

### Parent portal → Track
Parent Dashboard → choose child (switcher) → **Track** tab (or *Open live location* on the
home screen, or `/parent-360/track/:studentId` from a notification): child name and photo,
tracking status, current location, map, latitude, longitude, last updated time, and the
last 7 days of history. The parent's own record id is part of every URL and is checked
against the signed-in account; other children return 404.

## Sample data

- Every enabled student has a daily pattern for the previous six school days and a full
  "today" (home → in transit → campus pings every 30 minutes → home), truncated at the
  current time. Absent students stay at home.
- Special states for demonstration: Keerthi Pillai (paused), Nithya Venkatesh (offline),
  Tanya Subramani (disabled), Rithvik Menon (offline).
- **Aarav Kumar (HS-2026-1091)** — the brief's example — is on a field visit in Coimbatore:
  10:00 `11.0168, 76.9558` · 10:15 `11.0171, 76.9562` · 10:30 `11.0178, 76.9571` ·
  10:32 `11.0168, 76.9558`, then pings at the venue every 15 minutes until 17:30.

## Moving to production

1. Issue GPS tags / enable the bus units; create a service user with only `tracking.write`
   and have devices post to `POST /api/students/:id/location` (or add a bulk ingest
   endpoint behind the same service).
2. Record guardian consent (`consent_given_by`, `consent_given_at`) before enabling.
3. Set `system_settings.tracking.sample_data` to `false` and delete sample rows
   (`DELETE FROM student_locations WHERE source = 'sample'`).
4. Add home geofences per student if at-home detection should not rely on bus stops.
5. Consider partitioning `student_locations` by month and a retention policy
   (e.g. 90 days) — the schema and indexes already support it.
6. Optionally switch the map tiles via `MAP_TILE_URL` (and `MAP_API_KEY`) to a commercial provider.
