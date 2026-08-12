import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';

type Station = Record<string, unknown> & { id: string };
type Firefighter = Record<string, unknown> & { id: string };
type Vehicle = Record<string, unknown> & { id: string };
type Incident = Record<string, unknown> & { id: string; status: string };
type Inspection = Record<string, unknown> & { id: string };

const STATION_WRITABLE = ['name', 'code', 'address', 'phone'] as const;
const FIREFIGHTER_WRITABLE = [
  'firstName',
  'lastName',
  'rank',
  'phone',
  'nationalCode',
  'isOnDuty',
  'isActive',
] as const;
const VEHICLE_WRITABLE = ['name', 'plateNo', 'vehicleType', 'status'] as const;

const INCIDENT_STATUSES = [
  'DISPATCHED',
  'ON_SCENE',
  'CONTAINED',
  'RESOLVED',
  'CANCELLED',
];
const OPEN_INCIDENT_STATUSES = ['REPORTED', 'DISPATCHED', 'ON_SCENE', 'CONTAINED'];

/** A safety certificate stays valid for one year from the inspection. */
const CERTIFICATE_VALID_YEARS = 1;

const WITH_STATION = (table: string) => `
  SELECT x.*, s.name AS "stationName", s.code AS "stationCode"
  FROM "${table}" x JOIN "FireStation" s ON s.id = x."stationId"
`;

@Injectable()
export class FireDepartmentService {
  constructor(private readonly db: DatabaseService) {}

  // ==========================================
  // ایستگاه‌ها (Fire Stations)
  // ==========================================

  async findAllStations(companyId: string) {
    return this.db.query<Station>(
      `SELECT s.*,
              (SELECT count(*)::int FROM "FireFighter" f WHERE f."stationId" = s.id)
                AS "firefightersCount",
              (SELECT count(*)::int FROM "FireVehicle" v WHERE v."stationId" = s.id)
                AS "vehiclesCount",
              (SELECT count(*)::int FROM "FireIncident" i WHERE i."stationId" = s.id)
                AS "incidentsCount"
       FROM "FireStation" s WHERE s."companyId" = $1 ORDER BY s."createdAt" DESC`,
      [companyId],
    );
  }

  private async requireStation(id: string, companyId: string): Promise<Station> {
    const rows = await this.db.query<Station>(
      'SELECT * FROM "FireStation" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('ایستگاه آتش‌نشانی یافت نشد');
    return rows[0];
  }

  async findStation(id: string, companyId: string) {
    const station = await this.requireStation(id, companyId);

    const [firefighters, vehicles, incidents] = await Promise.all([
      this.db.query<Firefighter>(
        'SELECT * FROM "FireFighter" WHERE "stationId" = $1 ORDER BY "createdAt" DESC',
        [id],
      ),
      this.db.query<Vehicle>(
        'SELECT * FROM "FireVehicle" WHERE "stationId" = $1 ORDER BY "createdAt" DESC',
        [id],
      ),
      this.db.query<Incident>(
        'SELECT * FROM "FireIncident" WHERE "stationId" = $1 ORDER BY "reportedAt" DESC LIMIT 20',
        [id],
      ),
    ]);

    return { ...station, firefighters, vehicles, incidents };
  }

  async createStation(
    companyId: string,
    data: { name: string; code: string; address?: string; phone?: string },
  ) {
    const rows = await this.db.query<Station>(
      `INSERT INTO "FireStation" (id, "companyId", name, code, address, phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [randomUUID(), companyId, data.name, data.code, data.address ?? null, data.phone ?? null],
    );
    return rows[0];
  }

  async updateStation(id: string, companyId: string, data: object) {
    await this.requireStation(id, companyId);

    const params = new Params();
    const assignments = setClause(STATION_WRITABLE, data, params);
    if (!assignments) return this.requireStation(id, companyId);

    const rows = await this.db.query<Station>(
      `UPDATE "FireStation" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  async removeStation(id: string, companyId: string) {
    const station = await this.requireStation(id, companyId);
    await this.db.execute('DELETE FROM "FireStation" WHERE id = $1', [id]);
    return station;
  }

  // ==========================================
  // پرسنل آتش‌نشان (Firefighters)
  // ==========================================

  async findFirefighters(companyId: string, stationId?: string) {
    const values: unknown[] = [companyId];
    let where = 's."companyId" = $1';
    if (stationId) {
      values.push(stationId);
      where += ` AND x."stationId" = $${values.length}`;
    }
    return this.db.query<Firefighter>(
      `${WITH_STATION('FireFighter')} WHERE ${where} ORDER BY x."createdAt" DESC`,
      values,
    );
  }

  async createFirefighter(
    companyId: string,
    data: {
      stationId: string;
      firstName: string;
      lastName: string;
      rank?: string;
      phone?: string;
      nationalCode?: string;
    },
  ) {
    await this.requireStation(data.stationId, companyId);

    const rows = await this.db.query<Firefighter>(
      `INSERT INTO "FireFighter"
         (id, "stationId", "firstName", "lastName", rank, phone, "nationalCode")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        randomUUID(),
        data.stationId,
        data.firstName,
        data.lastName,
        data.rank ?? 'FIREFIGHTER',
        data.phone ?? null,
        data.nationalCode ?? null,
      ],
    );
    return rows[0];
  }

  async updateFirefighter(id: string, companyId: string, data: object) {
    await this.requireScoped('FireFighter', id, companyId, 'آتش‌نشان یافت نشد');

    const params = new Params();
    const assignments = setClause(FIREFIGHTER_WRITABLE, data, params);
    if (!assignments) {
      return this.requireScoped('FireFighter', id, companyId, 'آتش‌نشان یافت نشد');
    }

    const rows = await this.db.query<Firefighter>(
      `UPDATE "FireFighter" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  // ==========================================
  // خودروها (Fire Vehicles)
  // ==========================================

  async findVehicles(companyId: string, stationId?: string) {
    const values: unknown[] = [companyId];
    let where = 's."companyId" = $1';
    if (stationId) {
      values.push(stationId);
      where += ` AND x."stationId" = $${values.length}`;
    }
    return this.db.query<Vehicle>(
      `${WITH_STATION('FireVehicle')} WHERE ${where} ORDER BY x."createdAt" DESC`,
      values,
    );
  }

  async createVehicle(
    companyId: string,
    data: { stationId: string; name: string; plateNo: string; vehicleType: string },
  ) {
    await this.requireStation(data.stationId, companyId);

    const rows = await this.db.query<Vehicle>(
      `INSERT INTO "FireVehicle" (id, "stationId", name, "plateNo", "vehicleType", status)
       VALUES ($1, $2, $3, $4, $5, 'READY') RETURNING *`,
      [randomUUID(), data.stationId, data.name, data.plateNo, data.vehicleType],
    );
    return rows[0];
  }

  async updateVehicle(id: string, companyId: string, data: object) {
    await this.requireScoped('FireVehicle', id, companyId, 'خودرو یافت نشد');

    const params = new Params();
    const assignments = setClause(VEHICLE_WRITABLE, data, params);
    if (!assignments) {
      return this.requireScoped('FireVehicle', id, companyId, 'خودرو یافت نشد');
    }

    const rows = await this.db.query<Vehicle>(
      `UPDATE "FireVehicle" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  // ==========================================
  // حوادث و مأموریت‌ها (Incidents)
  // ==========================================

  async findIncidents(
    companyId: string,
    options?: { status?: string; type?: string; stationId?: string },
  ) {
    const params = new Params();
    const conditions = [`i."companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`i.status = ${params.next(options.status)}`);
    if (options?.type) conditions.push(`i.type = ${params.next(options.type)}`);
    if (options?.stationId) conditions.push(`i."stationId" = ${params.next(options.stationId)}`);

    return this.db.query<Incident>(
      `SELECT i.*, s.name AS "stationName", s.code AS "stationCode"
       FROM "FireIncident" i LEFT JOIN "FireStation" s ON s.id = i."stationId"
       WHERE ${conditions.join(' AND ')} ORDER BY i."reportedAt" DESC`,
      params.values,
    );
  }

  async findIncident(id: string, companyId: string) {
    const rows = await this.db.query<Incident>(
      'SELECT * FROM "FireIncident" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('حادثه یافت نشد');

    const stations = rows[0].stationId
      ? await this.db.query('SELECT * FROM "FireStation" WHERE id = $1', [rows[0].stationId])
      : [];
    return { ...rows[0], station: stations[0] ?? null };
  }

  /** ثبت حادثه جدید (تماس شهروند با ۱۲۵) */
  async reportIncident(
    companyId: string,
    data: {
      type?: string;
      address: string;
      reporterName?: string;
      reporterPhone?: string;
      description?: string;
    },
  ) {
    const rows = await this.db.query<Incident>(
      `INSERT INTO "FireIncident"
         (id, "companyId", "incidentNo", type, status, address,
          "reporterName", "reporterPhone", description)
       VALUES ($1, $2, $3, $4, 'REPORTED', $5, $6, $7, $8) RETURNING *`,
      [
        randomUUID(),
        companyId,
        `INC-${Date.now()}`,
        data.type ?? 'FIRE',
        data.address,
        data.reporterName ?? null,
        data.reporterPhone ?? null,
        data.description ?? null,
      ],
    );
    return rows[0];
  }

  /** اعزام نیرو: تخصیص ایستگاه و تغییر وضعیت به اعزام‌شده */
  async dispatchIncident(id: string, companyId: string, stationId: string) {
    const incident = await this.findIncident(id, companyId);
    if (['RESOLVED', 'CANCELLED'].includes(incident.status)) {
      throw new BadRequestException('این حادثه قبلاً بسته شده است');
    }
    await this.requireStation(stationId, companyId);

    const rows = await this.db.query<Incident>(
      `UPDATE "FireIncident"
       SET "stationId" = $1, status = 'DISPATCHED', "dispatchedAt" = now(), "updatedAt" = now()
       WHERE id = $2 RETURNING *`,
      [stationId, id],
    );
    return rows[0];
  }

  /** به‌روزرسانی وضعیت عملیات (در محل، مهار‌شده، پایان‌یافته، لغو) */
  async updateIncidentStatus(
    id: string,
    companyId: string,
    data: { status: string; casualties?: number; injuries?: number },
  ) {
    const incident = await this.findIncident(id, companyId);
    if (!INCIDENT_STATUSES.includes(data.status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    const params = new Params();
    const assignments = [`status = ${params.next(data.status)}`];
    if (data.casualties !== undefined) {
      assignments.push(`casualties = ${params.next(data.casualties)}`);
    }
    if (data.injuries !== undefined) {
      assignments.push(`injuries = ${params.next(data.injuries)}`);
    }
    if (data.status === 'RESOLVED') assignments.push('"resolvedAt" = now()');

    const rows = await this.db.query<Incident>(
      `UPDATE "FireIncident" SET ${assignments.join(', ')}, "updatedAt" = now()
       WHERE id = ${params.next(incident.id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  // ==========================================
  // بازدیدهای ایمنی و تأییدیه (Safety Inspections)
  // ==========================================

  async findSafetyInspections(companyId: string, result?: string) {
    const values: unknown[] = [companyId];
    let where = '"companyId" = $1';
    if (result) {
      values.push(result);
      where += ` AND result = $${values.length}`;
    }
    return this.db.query<Inspection>(
      `SELECT * FROM "SafetyInspection" WHERE ${where} ORDER BY "inspectedAt" DESC`,
      values,
    );
  }

  /** ثبت بازدید ایمنی — در صورت قبولی، تأییدیه ایمنی یک‌ساله صادر می‌شود */
  async createSafetyInspection(
    companyId: string,
    data: {
      propertyName: string;
      address: string;
      ownerName: string;
      ownerPhone?: string;
      result: string;
      notes?: string;
    },
  ) {
    const passed = data.result === 'PASSED';
    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + CERTIFICATE_VALID_YEARS);

    const rows = await this.db.query<Inspection>(
      `INSERT INTO "SafetyInspection"
         (id, "companyId", "propertyName", address, "ownerName", "ownerPhone",
          result, notes, "certificateNo", "validUntil")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.propertyName,
        data.address,
        data.ownerName,
        data.ownerPhone ?? null,
        data.result,
        data.notes ?? null,
        passed ? `CERT-${Date.now()}` : null,
        passed ? validUntil : null,
      ],
    );
    return rows[0];
  }

  // ==========================================
  // آمار آتش‌نشانی
  // ==========================================

  async stats(companyId: string) {
    const rows = await this.db.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM "FireStation" WHERE "companyId" = $1) AS stations,
         (SELECT count(*)::text FROM "FireFighter" f
            JOIN "FireStation" s ON s.id = f."stationId"
          WHERE s."companyId" = $1) AS firefighters_total,
         (SELECT count(*)::text FROM "FireFighter" f
            JOIN "FireStation" s ON s.id = f."stationId"
          WHERE s."companyId" = $1 AND f."isOnDuty" = true) AS firefighters_on_duty,
         (SELECT count(*)::text FROM "FireVehicle" v
            JOIN "FireStation" s ON s.id = v."stationId"
          WHERE s."companyId" = $1) AS vehicles_total,
         (SELECT count(*)::text FROM "FireVehicle" v
            JOIN "FireStation" s ON s.id = v."stationId"
          WHERE s."companyId" = $1 AND v.status = 'READY') AS vehicles_ready,
         (SELECT count(*)::text FROM "FireIncident" WHERE "companyId" = $1) AS incidents_total,
         (SELECT count(*)::text FROM "FireIncident"
          WHERE "companyId" = $1 AND status = ANY($2)) AS incidents_active,
         (SELECT count(*)::text FROM "FireIncident"
          WHERE "companyId" = $1 AND status = 'RESOLVED') AS incidents_resolved,
         (SELECT count(*)::text FROM "SafetyInspection"
          WHERE "companyId" = $1) AS inspections_total,
         (SELECT count(*)::text FROM "SafetyInspection"
          WHERE "companyId" = $1 AND result = 'PASSED') AS inspections_passed,
         (SELECT count(*)::text FROM "SafetyInspection"
          WHERE "companyId" = $1 AND result = 'FAILED') AS inspections_failed`,
      [companyId, OPEN_INCIDENT_STATUSES],
    );

    const row = rows[0] ?? {};
    return {
      stations: Number(row.stations ?? 0),
      firefighters: {
        total: Number(row.firefighters_total ?? 0),
        onDuty: Number(row.firefighters_on_duty ?? 0),
      },
      vehicles: {
        total: Number(row.vehicles_total ?? 0),
        ready: Number(row.vehicles_ready ?? 0),
      },
      incidents: {
        total: Number(row.incidents_total ?? 0),
        active: Number(row.incidents_active ?? 0),
        resolved: Number(row.incidents_resolved ?? 0),
      },
      safetyInspections: {
        total: Number(row.inspections_total ?? 0),
        passed: Number(row.inspections_passed ?? 0),
        failed: Number(row.inspections_failed ?? 0),
      },
    };
  }

  /** Loads a station-owned row, confirming it belongs to the caller's company. */
  private async requireScoped(
    table: 'FireFighter' | 'FireVehicle',
    id: string,
    companyId: string,
    message: string,
  ) {
    const rows = await this.db.query<Record<string, unknown> & { id: string }>(
      `SELECT x.* FROM "${table}" x JOIN "FireStation" s ON s.id = x."stationId"
       WHERE x.id = $1 AND s."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException(message);
    return rows[0];
  }
}
