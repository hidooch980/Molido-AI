import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * فهرست بانک‌های ایران برای انتخاب در فرم ثبت کارت‌خوان
 */
const IRANIAN_BANKS = [
  'بانک ملی ایران',
  'بانک سپه',
  'بانک ملت',
  'بانک تجارت',
  'بانک صادرات ایران',
  'بانک کشاورزی',
  'بانک مسکن',
  'بانک رفاه کارگران',
  'پست بانک',
  'بانک اقتصاد نوین',
  'بانک پارسیان',
  'بانک پاسارگاد',
  'بانک سامان',
  'بانک سینا',
  'بانک آینده',
  'بانک شهر',
  'بانک دی',
  'بانک رسالت',
  'بانک توسعه تعاون',
  'بانک کارآفرین',
  'بانک ایران زمین',
  'بانک سرمایه',
  'بانک گردشگری',
  'بانک خاورمیانه',
  'بانک ملل',
  'بانک مهر ایران',
  'بانک صنعت و معدن',
  'بانک توسعه صادرات',
];

/**
 * شرکت‌های پرداخت (PSP) دارنده مجوز شاپرک
 */
const PSP_PROVIDERS = [
  'به‌پرداخت ملت',
  'پرداخت الکترونیک سداد',
  'سامان کیش',
  'آسان پرداخت پرشین',
  'ایران کیش',
  'پرداخت نوین آرین',
  'تجارت الکترونیک پارسیان',
  'پرداخت الکترونیک پاسارگاد',
  'فن آوا کارت',
  'سایان کارت',
  'مبنا کارت آریا',
  'الکترونیک کارت دماوند',
];

const POS_STATUSES = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'RETURNED'];

@Injectable()
export class PosTerminalsService {
  constructor(private readonly prisma: PrismaService) {}

  banks() {
    return { banks: IRANIAN_BANKS, psps: PSP_PROVIDERS };
  }

  async findAll(
    companyId: string,
    options?: {
      type?: string;
      status?: string;
      bankName?: string;
      search?: string;
    },
  ) {
    return this.prisma.posTerminal.findMany({
      where: {
        companyId,
        ...(options?.type ? { type: options.type as never } : {}),
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.bankName
          ? { bankName: { contains: options.bankName } }
          : {}),
        ...(options?.search
          ? {
              OR: [
                { terminalNo: { contains: options.search } },
                { serialNo: { contains: options.search } },
                { merchantId: { contains: options.search } },
                {
                  holderName: {
                    contains: options.search,
                    mode: 'insensitive',
                  },
                },
                {
                  location: { contains: options.search, mode: 'insensitive' },
                },
              ],
            }
          : {}),
      },
      include: {
        cashBox: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const terminal = await this.prisma.posTerminal.findFirst({
      where: { id, companyId },
      include: {
        cashBox: { select: { id: true, name: true, code: true } },
      },
    });

    if (!terminal) {
      throw new NotFoundException('کارت‌خوان یافت نشد');
    }

    return terminal;
  }

  async create(
    companyId: string,
    data: {
      terminalNo: string;
      serialNo?: string;
      merchantId?: string;
      bankName: string;
      pspName?: string;
      type?: string;
      accountNo?: string;
      iban?: string;
      holderName?: string;
      location?: string;
      simNumber?: string;
      cashBoxId?: string;
      installedAt?: string;
      note?: string;
    },
  ) {
    if (!data.terminalNo) {
      throw new BadRequestException('شماره پایانه (ترمینال) الزامی است');
    }

    if (!data.bankName) {
      throw new BadRequestException('نام بانک الزامی است');
    }

    if (data.type && !['FIXED', 'MOBILE'].includes(data.type)) {
      throw new BadRequestException(
        'نوع کارت‌خوان باید FIXED (ثابت) یا MOBILE (سیار) باشد',
      );
    }

    const existing = await this.prisma.posTerminal.findUnique({
      where: { terminalNo: data.terminalNo },
    });

    if (existing) {
      throw new ConflictException(
        'کارت‌خوانی با این شماره پایانه قبلاً ثبت شده است',
      );
    }

    if (data.cashBoxId) {
      const cashBox = await this.prisma.cashBox.findFirst({
        where: { id: data.cashBoxId, companyId },
      });

      if (!cashBox) {
        throw new NotFoundException('صندوق مرتبط یافت نشد');
      }
    }

    return this.prisma.posTerminal.create({
      data: {
        companyId,
        terminalNo: data.terminalNo,
        serialNo: data.serialNo,
        merchantId: data.merchantId,
        bankName: data.bankName,
        pspName: data.pspName,
        type: (data.type ?? 'FIXED') as never,
        status: 'ACTIVE',
        accountNo: data.accountNo,
        iban: data.iban,
        holderName: data.holderName,
        location: data.location,
        simNumber: data.simNumber,
        cashBoxId: data.cashBoxId,
        installedAt: data.installedAt ? new Date(data.installedAt) : undefined,
        note: data.note,
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: {
      serialNo?: string;
      merchantId?: string;
      bankName?: string;
      pspName?: string;
      type?: string;
      accountNo?: string;
      iban?: string;
      holderName?: string;
      location?: string;
      simNumber?: string;
      cashBoxId?: string | null;
      installedAt?: string;
      note?: string;
    },
  ) {
    await this.findOne(id, companyId);

    if (data.type && !['FIXED', 'MOBILE'].includes(data.type)) {
      throw new BadRequestException(
        'نوع کارت‌خوان باید FIXED (ثابت) یا MOBILE (سیار) باشد',
      );
    }

    if (data.cashBoxId) {
      const cashBox = await this.prisma.cashBox.findFirst({
        where: { id: data.cashBoxId, companyId },
      });

      if (!cashBox) {
        throw new NotFoundException('صندوق مرتبط یافت نشد');
      }
    }

    return this.prisma.posTerminal.update({
      where: { id },
      data: {
        ...(data.serialNo !== undefined ? { serialNo: data.serialNo } : {}),
        ...(data.merchantId !== undefined
          ? { merchantId: data.merchantId }
          : {}),
        ...(data.bankName ? { bankName: data.bankName } : {}),
        ...(data.pspName !== undefined ? { pspName: data.pspName } : {}),
        ...(data.type ? { type: data.type as never } : {}),
        ...(data.accountNo !== undefined
          ? { accountNo: data.accountNo }
          : {}),
        ...(data.iban !== undefined ? { iban: data.iban } : {}),
        ...(data.holderName !== undefined
          ? { holderName: data.holderName }
          : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.simNumber !== undefined
          ? { simNumber: data.simNumber }
          : {}),
        ...(data.cashBoxId !== undefined
          ? { cashBoxId: data.cashBoxId }
          : {}),
        ...(data.installedAt
          ? { installedAt: new Date(data.installedAt) }
          : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
      },
    });
  }

  /**
   * تغییر وضعیت: فعال / غیرفعال / در حال تعمیر / عودت به بانک
   */
  async updateStatus(id: string, companyId: string, status: string) {
    if (!POS_STATUSES.includes(status)) {
      throw new BadRequestException(
        `وضعیت نامعتبر است. مقادیر مجاز: ${POS_STATUSES.join(', ')}`,
      );
    }

    await this.findOne(id, companyId);

    return this.prisma.posTerminal.update({
      where: { id },
      data: { status: status as never },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    await this.prisma.posTerminal.delete({ where: { id } });

    return { deleted: true, id };
  }

  async stats(companyId: string) {
    const terminals = await this.prisma.posTerminal.findMany({
      where: { companyId },
      select: { type: true, status: true, bankName: true },
    });

    const typed = terminals as Array<{
      type: string;
      status: string;
      bankName: string;
    }>;

    const byBank: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const t of typed) {
      byBank[t.bankName] = (byBank[t.bankName] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    }

    return {
      total: typed.length,
      active: typed.filter((t) => t.status === 'ACTIVE').length,
      fixed: typed.filter((t) => t.type === 'FIXED').length,
      mobile: typed.filter((t) => t.type === 'MOBILE').length,
      underRepair: typed.filter((t) => t.status === 'UNDER_REPAIR').length,
      byBank,
      byStatus,
    };
  }
}
