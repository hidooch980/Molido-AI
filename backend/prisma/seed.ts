import process from 'node:process';
/**
 * Seed دیتابیس Molido AI
 * اجرا: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 شروع seed دیتابیس...');

  // ----- شرکت نمونه -----
  const company = await prisma.company.upsert({
    where: { id: 'seed-company' },
    update: {},
    create: {
      id: 'seed-company',
      name: 'فروشگاه نمونه مولیدو',
      country: 'IR',
      city: 'تهران',
    },
  });

  // ----- کاربر مدیر -----
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@molido.ai' },
    update: {},
    create: {
      firstName: 'مدیر',
      lastName: 'سیستم',
      email: 'admin@molido.ai',
      password: adminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      companyId: company.id,
    },
  });

  // ----- انبار اصلی -----
  const warehouse = await prisma.warehouse.upsert({
    where: { id: 'seed-warehouse' },
    update: {},
    create: {
      id: 'seed-warehouse',
      name: 'انبار مرکزی',
      code: 'WH-01',
      companyId: company.id,
    },
  });

  // ----- صندوق اصلی -----
  await prisma.cashBox.upsert({
    where: { id: 'seed-cashbox' },
    update: {},
    create: {
      id: 'seed-cashbox',
      name: 'صندوق اصلی',
      code: 'CB-01',
      balance: 0,
      companyId: company.id,
    },
  });

  // ----- دسته‌بندی نمونه -----
  const category = await prisma.category.upsert({
    where: { id: 'seed-category' },
    update: {},
    create: {
      id: 'seed-category',
      name: 'مواد غذایی',
      companyId: company.id,
    },
  });

  // ----- کالاهای نمونه -----
  // بارکدها EAN-13 نمونه‌اند تا جریان اسکن در صندوق قابل آزمایش باشد.
  const products = [
    { id: 'seed-p1', name: 'برنج ایرانی ۱۰ کیلویی', sku: 'RICE-10', barcode: '6260100110014', purchasePrice: 900000, salePrice: 1100000, unit: 'کیسه' },
    { id: 'seed-p2', name: 'روغن آفتابگردان', sku: 'OIL-01', barcode: '6260100110021', purchasePrice: 120000, salePrice: 155000, unit: 'عدد' },
    { id: 'seed-p3', name: 'قند ۵ کیلویی', sku: 'SUGAR-5', barcode: '6260100110038', purchasePrice: 250000, salePrice: 310000, unit: 'بسته' },
    { id: 'seed-p4', name: 'ماکارونی ۷۰۰ گرمی', sku: 'PASTA-700', barcode: '6260100110045', purchasePrice: 45000, salePrice: 62000, unit: 'عدد' },
    { id: 'seed-p5', name: 'چای کیسه‌ای ۱۰۰ عددی', sku: 'TEA-100', barcode: '6260100110052', purchasePrice: 180000, salePrice: 240000, unit: 'بسته' },
    { id: 'seed-p6', name: 'شیر پرچرب ۱ لیتری', sku: 'MILK-1L', barcode: '6260100110069', purchasePrice: 38000, salePrice: 52000, unit: 'عدد' },
    { id: 'seed-p7', name: 'تخم‌مرغ بسته ۲۰ عددی', sku: 'EGG-20', barcode: '6260100110076', purchasePrice: 195000, salePrice: 260000, unit: 'بسته' },
    { id: 'seed-p8', name: 'ماست موسیر ۹۰۰ گرمی', sku: 'YOG-900', barcode: '6260100110083', purchasePrice: 88000, salePrice: 119000, unit: 'عدد' },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        ...p,
        companyId: company.id,
        categoryId: category.id,
        minStock: 10,
      },
    });

    await prisma.inventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: warehouse.id,
          productId: p.id,
        },
      },
      update: {},
      create: {
        warehouseId: warehouse.id,
        productId: p.id,
        quantity: 50,
      },
    });
  }

  // ----- مشتری نمونه -----
  await prisma.customer.upsert({
    where: { id: 'seed-customer' },
    update: {},
    create: {
      id: 'seed-customer',
      firstName: 'علی',
      lastName: 'رضایی',
      phone: '09120000000',
      companyId: company.id,
    },
  });

  // ----- تأمین‌کننده نمونه -----
  await prisma.supplier.upsert({
    where: { id: 'seed-supplier' },
    update: {},
    create: {
      id: 'seed-supplier',
      name: 'پخش مواد غذایی تهران',
      phone: '02100000000',
      companyId: company.id,
    },
  });

  console.log('✅ Seed کامل شد');
  console.log('👤 کاربر مدیر: admin@molido.ai / admin123');
  console.log(`🏢 شرکت: ${company.name} (${admin.email})`);
}

main()
  .catch((e) => {
    console.error('❌ خطا در seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
