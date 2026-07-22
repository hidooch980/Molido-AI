import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FireDepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // ایستگاه‌ها (Fire Stations)
  // ==========================================

  async findAllStations(companyId: string) {
    return this.prisma.fireStation.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { firefighters: true, vehicles: true, incidents: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findStation(id: string, companyId: string) {
    const station = await this.prisma.fireStation.findFirst({
      where: { id, companyId },
      include: {
        firefighters: { orderBy: { createdAt: 'desc' } },
        vehicles: { orderBy: { createdAt: 'desc' } },
        incidents: { orderBy: { reportedAt: 'desc' }, take: 20 },
      },
    });

    if (!station) {
      throw new NotFoundException('ایستگاه آتش‌نشانی یافت نشد');
    }

    return station;
  }

  async createStation(
    companyId: string,
    data: { name: string; code: string; address?: string; phone?: string },
  ) {
    return this.prisma.fireStation.create({
      data: { ...data, companyId },
    });
  }

  async updateStation(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    await this.findStation(id, companyId);

    return this.prisma.fireStation.update({
      where: { id },
      data: data as never,
    });
  }

  async removeStation(id: string, companyId: string) {
    await this.findStation(id, companyId);

    return this.prisma.fireStation.delete({ where: { id } });
  }

  // ==========================================
  // پرسنل آتش‌نشان (Firefighters)
  // ==========================================

  async findFirefighters(companyId: string, stationId?: string) {
    return this.prisma.fireFighter.findMany({
      where: {
        station: { companyId },
        ...(stationId ? { stationId } : {}),
      },
      include: {
        station: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    await this.findStation(data.stationId, companyId);

    return this.prisma.fireFighter.create({
      data: {
        stationId: data.stationId,
        firstName: data.firstName,
        lastName: data.lastName,
        rank: (data.rank ?? 'FIREFIGHTER') as never,
        phone: data.phone,
        nationalCode: data.nationalCode,
      },
    });
  }

  async updateFirefighter(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    const firefighter = await this.prisma.fireFighter.findFirst({
      where: { id, station: { companyId } },
    });

    if (!firefighter) {
      throw new NotFoundException('آتش‌نشان یافت نشد');
    }

    return this.prisma.fireFighter.update({
      where: { id },
      data: data as never,
    });
  }

  // ==========================================
  // خودروها (Fire Vehicles)
  // ==========================================

  async findVehicles(companyId: string, stationId?: string) {
    return this.prisma.fireVehicle.findMany({
      where: {
        station: { companyId },
        ...(stationId ? { stationId } : {}),
      },
      include: {
        station: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVehicle(
    companyId: string,
    data: {
      stationId: string;
      name: string;
      plateNo: string;
      vehicleType: string;
    },
  ) {
    await this.findStation(data.stationId, companyId);

    return this.prisma.fireVehicle.create({
      data: {
        stationId: data.stationId,
        name: data.name,
        plateNo: data.plateNo,
        vehicleType: data.vehicleType,
        status: 'READY',
      },
    });
  }

  async updateVehicle(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    const vehicle = await this.prisma.fireVehicle.findFirst({
      where: { id, station: { companyId } },
    });

    if (!vehicle) {
      throw new NotFoundException('خودرو یافت نشد');
    }

    return this.prisma.fireVehicle.update({
      where: { id },
      data: data as never,
    });
  }

  // ==========================================
  // حوادث و مأموریت‌ها (Incidents)
  // ==========================================

  async findIncidents(
    companyId: string,
    options?: { status?: string; type?: string; stationId?: string },
  ) {
    return this.prisma.fireIncident.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.type ? { type: options.type as never } : {}),
        ...(options?.stationId ? { stationId: options.stationId } : {}),
      },
      include: {
        station: { select: { id: true, name: true, code: true } },
      },
      orderBy: { reportedAt: 'desc' },
    });
  }

  async findIncident(id: string, companyId: string) {
    const incident = await this.prisma.fireIncident.findFirst({
      where: { id, companyId },
      include: { station: true },
    });

    if (!incident) {
      throw new NotFoundException('حادثه یافت نشد');
    }

    return incident;
  }

  /**
   * ثبت حادثه جدید (تماس شهروند با ۱۲۵)
   */
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
    return this.prisma.fireIncident.create({
      data: {
        companyId,
        incidentNo: `INC-${Date.now()}`,
        type: (data.type ?? 'FIRE') as never,
        status: 'REPORTED',
        address: data.address,
        reporterName: data.reporterName,
        reporterPhone: data.reporterPhone,
        description: data.description,
      },
    });
  }

  /**
   * اعزام نیرو: تخصیص ایستگاه و تغییر وضعیت به اعزام‌شده
   */
  async dispatchIncident(id: string, companyId: string, stationId: string) {
    const incident = await this.findIncident(id, companyId);

    if (['RESOLVED', 'CANCELLED'].includes(incident.status)) {
      throw new BadRequestException('این حادثه قبلاً بسته شده است');
    }

    await this.findStation(stationId, companyId);

    return this.prisma.fireIncident.update({
      where: { id },
      data: {
        stationId,
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
      },
    });
  }

  /**
   * به‌روزرسانی وضعیت عملیات (در محل، مهار‌شده، پایان‌یافته، لغو)
   */
  async updateIncidentStatus(
    id: string,
    companyId: string,
    data: { status: string; casualties?: number; injuries?: number },
  ) {
    const incident = await this.findIncident(id, companyId);

    const allowed = [
      'DISPATCHED',
      'ON_SCENE',
      'CONTAINED',
      'RESOLVED',
      'CANCELLED',
    ];

    if (!allowed.includes(data.status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    return this.prisma.fireIncident.update({
      where: { id: incident.id },
      data: {
        status: data.status as never,
        ...(data.casualties !== undefined
          ? { casualties: data.casualties }
          : {}),
        ...(data.injuries !== undefined ? { injuries: data.injuries } : {}),
        ...(data.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
      },
    });
  }

  // ==========================================
  // بازدیدهای ایمنی و تأییدیه (Safety Inspections)
  // ==========================================

  async findSafetyInspections(companyId: string, result?: string) {
    return this.prisma.safetyInspection.findMany({
      where: {
        companyId,
        ...(result ? { result: result as never } : {}),
      },
      orderBy: { inspectedAt: 'desc' },
    });
  }

  /**
   * ثبت بازدید ایمنی — در صورت قبولی، تأییدیه ایمنی یک‌ساله صادر می‌شود
   */
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
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    return this.prisma.safetyInspection.create({
      data: {
        companyId,
        propertyName: data.propertyName,
        address: data.address,
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone,
        result: data.result as never,
        notes: data.notes,
        ...(passed
          ? { certificateNo: `CERT-${Date.now()}`, validUntil }
          : {}),
      },
    });
  }

  // ==========================================
  // آمار آتش‌نشانی
  // ==========================================

  async stats(companyId: string) {
    const [stations, firefighters, vehicles, incidents, inspections] =
      await Promise.all([
        this.prisma.fireStation.count({ where: { companyId } }),
        this.prisma.fireFighter.findMany({
          where: { station: { companyId } },
          select: { isOnDuty: true },
        }),
        this.prisma.fireVehicle.findMany({
          where: { station: { companyId } },
          select: { status: true },
        }),
        this.prisma.fireIncident.findMany({
          where: { companyId },
          select: { status: true, type: true },
        }),
        this.prisma.safetyInspection.findMany({
          where: { companyId },
          select: { result: true },
        }),
      ]);

    const active = incidents.filter((i: { status: string }) =>
      ['REPORTED', 'DISPATCHED', 'ON_SCENE', 'CONTAINED'].includes(i.status),
    ).length;

    return {
      stations,
      firefighters: {
        total: firefighters.length,
        onDuty: firefighters.filter((f: { isOnDuty: boolean }) => f.isOnDuty)
          .length,
      },
      vehicles: {
        total: vehicles.length,
        ready: vehicles.filter((v: { status: string }) => v.status === 'READY')
          .length,
      },
      incidents: {
        total: incidents.length,
        active,
        resolved: incidents.filter(
          (i: { status: string }) => i.status === 'RESOLVED',
        ).length,
      },
      safetyInspections: {
        total: inspections.length,
        passed: inspections.filter(
          (i: { result: string }) => i.result === 'PASSED',
        ).length,
        failed: inspections.filter(
          (i: { result: string }) => i.result === 'FAILED',
        ).length,
      },
    };
  }
}
