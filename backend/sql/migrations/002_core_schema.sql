-- Generated from prisma/schema.prisma by tools/generate-schema.ts.
-- Do not edit by hand; add a new migration file instead.

CREATE TABLE IF NOT EXISTS "Branch" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Customer" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT,
  phone TEXT,
  email TEXT,
  "nationalCode" TEXT,
  address TEXT,
  "creditLimit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Supplier" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Warehouse" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Category" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  "parentId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Product" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "categoryId" TEXT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  description TEXT,
  "purchasePrice" NUMERIC(18,2) NOT NULL,
  "salePrice" NUMERIC(18,2) NOT NULL,
  "taxRate" NUMERIC(18,2),
  unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "trackInventory" BOOLEAN NOT NULL DEFAULT true,
  "minStock" NUMERIC(18,2) NOT NULL DEFAULT 5,
  "expiryDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  id TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(18,2),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Inventory" (
  id TEXT PRIMARY KEY,
  "warehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  quantity NUMERIC(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Purchase" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "purchaseNo" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  subtotal NUMERIC(18,2) NOT NULL,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PurchaseItem" (
  id TEXT PRIMARY KEY,
  "purchaseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  quantity NUMERIC(18,2) NOT NULL,
  "purchasePrice" NUMERIC(18,2) NOT NULL,
  total NUMERIC(18,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Sale" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT,
  "userId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "invoiceNo" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  subtotal NUMERIC(18,2) NOT NULL,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SaleItem" (
  id TEXT PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  quantity NUMERIC(18,2) NOT NULL,
  price NUMERIC(18,2) NOT NULL,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CashBox" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Payment" (
  id TEXT PRIMARY KEY,
  "saleId" TEXT,
  "cashBoxId" TEXT,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  amount NUMERIC(18,2) NOT NULL,
  "referenceNo" TEXT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Expense" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Account" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BuildingPermit" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "permitNo" TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'CONSTRUCTION',
  status TEXT NOT NULL DEFAULT 'PENDING',
  "ownerName" TEXT NOT NULL,
  "ownerPhone" TEXT,
  "nationalCode" TEXT,
  address TEXT NOT NULL,
  "plateNumber" TEXT,
  area NUMERIC(18,2) NOT NULL DEFAULT 0,
  floors INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  "rejectReason" TEXT,
  "issuedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TechnicalInspection" (
  id TEXT PRIMARY KEY,
  "permitId" TEXT NOT NULL,
  "inspectorName" TEXT NOT NULL,
  result TEXT NOT NULL,
  notes TEXT,
  "inspectedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BuildingViolation" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "caseNo" TEXT UNIQUE NOT NULL,
  "ownerName" TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REPORTED',
  "fineAmount" NUMERIC(18,2),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FireStation" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FireFighter" (
  id TEXT PRIMARY KEY,
  "stationId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT 'FIREFIGHTER',
  phone TEXT,
  "nationalCode" TEXT,
  "isOnDuty" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FireVehicle" (
  id TEXT PRIMARY KEY,
  "stationId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "plateNo" TEXT UNIQUE NOT NULL,
  "vehicleType" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FireIncident" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "stationId" TEXT,
  "incidentNo" TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'FIRE',
  status TEXT NOT NULL DEFAULT 'REPORTED',
  address TEXT NOT NULL,
  "reporterName" TEXT,
  "reporterPhone" TEXT,
  description TEXT,
  casualties INTEGER NOT NULL DEFAULT 0,
  injuries INTEGER NOT NULL DEFAULT 0,
  "reportedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "dispatchedAt" TIMESTAMPTZ,
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SafetyInspection" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "propertyName" TEXT NOT NULL,
  address TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "ownerPhone" TEXT,
  result TEXT NOT NULL,
  "certificateNo" TEXT UNIQUE,
  "validUntil" TIMESTAMPTZ,
  notes TEXT,
  "inspectedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CitizenComplaint" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "trackingNo" TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER',
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  "citizenName" TEXT,
  "citizenPhone" TEXT,
  address TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  "referredTo" TEXT,
  "responseNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "MunicipalBill" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "billNo" TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'OTHER',
  status TEXT NOT NULL DEFAULT 'UNPAID',
  "payerName" TEXT NOT NULL,
  "payerPhone" TEXT,
  address TEXT,
  amount NUMERIC(18,2) NOT NULL,
  description TEXT,
  "permitId" TEXT,
  "paidAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Cheque" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "saleId" TEXT,
  "chequeNo" TEXT NOT NULL,
  "bankName" TEXT,
  "dueDate" TIMESTAMPTZ NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'RECEIVED',
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  "ownerName" TEXT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Installment" (
  id TEXT PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  seq INTEGER NOT NULL,
  "dueDate" TIMESTAMPTZ NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Attachment" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PosTerminal" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "terminalNo" TEXT UNIQUE NOT NULL,
  "serialNo" TEXT,
  "merchantId" TEXT,
  "bankName" TEXT NOT NULL,
  "pspName" TEXT,
  type TEXT NOT NULL DEFAULT 'FIXED',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "accountNo" TEXT,
  iban TEXT,
  "holderName" TEXT,
  location TEXT,
  "simNumber" TEXT,
  "cashBoxId" TEXT,
  "installedAt" TIMESTAMPTZ,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TreasuryAccount" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'BANK',
  "bankName" TEXT,
  "accountNo" TEXT,
  iban TEXT,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TreasuryTransaction" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  reference TEXT,
  description TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Contract" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "contractNo" TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SERVICE',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  "partyName" TEXT NOT NULL,
  "partyPhone" TEXT,
  "partyNationalId" TEXT,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ContractPayment" (
  id TEXT PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  "dueDate" TIMESTAMPTZ NOT NULL,
  "paidAt" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Employee" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeNo" TEXT UNIQUE NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "nationalId" TEXT,
  position TEXT,
  department TEXT,
  phone TEXT,
  "hireDate" TIMESTAMPTZ,
  "baseSalary" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "housingAllowance" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "foodAllowance" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PayrollSlip" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  period TEXT NOT NULL,
  "baseSalary" NUMERIC(18,2) NOT NULL DEFAULT 0,
  allowances NUMERIC(18,2) NOT NULL DEFAULT 0,
  "overtimeHours" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "overtimePay" NUMERIC(18,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(18,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
  insurance NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  "netPay" NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  "paidAt" TIMESTAMPTZ,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Budget" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  department TEXT,
  "totalAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "spentAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BudgetLine" (
  id TEXT PRIMARY KEY,
  "budgetId" TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  spent NUMERIC(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Asset" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "assetNo" TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  location TEXT,
  "assignedTo" TEXT,
  "purchaseDate" TIMESTAMPTZ,
  "purchasePrice" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "salvageValue" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "usefulLifeYears" INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'IN_USE',
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Tender" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "tenderNo" TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'TENDER',
  "baseAmount" NUMERIC(18,2),
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN',
  "winnerBidId" TEXT,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TenderBid" (
  id TEXT PRIMARY KEY,
  "tenderId" TEXT NOT NULL,
  "bidderName" TEXT NOT NULL,
  "bidderPhone" TEXT,
  amount NUMERIC(18,2) NOT NULL,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  "checkIn" TEXT,
  "checkOut" TEXT,
  "workedHours" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "overtimeHours" NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "LeaveRequest" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'PAID',
  "startDate" TIMESTAMPTZ NOT NULL,
  "endDate" TIMESTAMPTZ NOT NULL,
  days NUMERIC(18,2) NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PerformanceReview" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  period TEXT NOT NULL,
  score NUMERIC(18,2) NOT NULL,
  strengths TEXT,
  weaknesses TEXT,
  "reviewerName" TEXT,
  "suggestedBonus" NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ConstructionProject" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "projectNo" TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  "contractorName" TEXT,
  location TEXT,
  "budgetAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "physicalProgress" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "financialProgress" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PLANNING',
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FleetVehicle" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "plateNo" TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  "vehicleType" TEXT,
  "modelYear" INTEGER,
  "driverName" TEXT,
  "insuranceExpiry" TIMESTAMPTZ,
  "inspectionExpiry" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FleetService" (
  id TEXT PRIMARY KEY,
  "vehicleId" TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  "serviceType" TEXT NOT NULL,
  cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FleetFuelLog" (
  id TEXT PRIMARY KEY,
  "vehicleId" TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  liters NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  odometer INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ServiceZone" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'GREEN_SPACE',
  "areaSqm" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "contractorName" TEXT,
  schedule TEXT,
  "monthlyCost" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ZoneWorkLog" (
  id TEXT PRIMARY KEY,
  "zoneId" TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Letter" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "indicatorNo" TEXT UNIQUE NOT NULL,
  direction TEXT NOT NULL DEFAULT 'INCOMING',
  subject TEXT NOT NULL,
  "fromEntity" TEXT,
  "toEntity" TEXT,
  "letterDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "referredTo" TEXT,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  "fileUrl" TEXT,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT UNIQUE NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'BRONZE',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Coupon" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  percent INTEGER,
  amount NUMERIC(18,2),
  "expiresAt" TIMESTAMPTZ,
  "maxUses" INTEGER NOT NULL DEFAULT 0,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SalesOrder" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "orderNo" TEXT UNIQUE NOT NULL,
  "customerId" TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "totalAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SalesOrderItem" (
  id TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  name TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  title TEXT NOT NULL,
  amount NUMERIC(18,2),
  "requestedBy" TEXT,
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ApprovalStep" (
  id TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "stepNo" INTEGER NOT NULL,
  "approverRole" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  comment TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CitizenProfile" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "nationalId" TEXT UNIQUE NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CityServiceRequest" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "trackingCode" TEXT UNIQUE NOT NULL,
  "citizenId" TEXT,
  "serviceType" TEXT NOT NULL,
  subject TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  "assignedTo" TEXT,
  response TEXT,
  "answeredAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CityAnnouncement" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Cemetery" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Grave" (
  id TEXT PRIMARY KEY,
  "cemeteryId" TEXT NOT NULL,
  section TEXT,
  row INTEGER,
  number INTEGER,
  "deceasedName" TEXT,
  "buriedAt" TIMESTAMPTZ,
  "isOccupied" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BurialPermit" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "cemeteryId" TEXT,
  "permitNo" TEXT UNIQUE NOT NULL,
  "deceasedName" TEXT NOT NULL,
  "issueDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TaxiDriver" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "licenseNo" TEXT UNIQUE NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  phone TEXT,
  "plateNo" TEXT,
  "vehicleModel" TEXT,
  "licenseExpiry" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TaxiViolation" (
  id TEXT PRIMARY KEY,
  "driverId" TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  fine NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BusinessLicense" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "licenseNo" TEXT UNIQUE NOT NULL,
  "businessName" TEXT NOT NULL,
  "ownerName" TEXT,
  phone TEXT,
  address TEXT,
  "businessType" TEXT,
  "issueDate" TIMESTAMPTZ,
  "expiryDate" TIMESTAMPTZ,
  "annualFee" NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "GuildInspection" (
  id TEXT PRIMARY KEY,
  "licenseId" TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  inspector TEXT,
  result TEXT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "MunicipalProperty" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "propNo" TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  "areaSqm" NUMERIC(18,2),
  status TEXT NOT NULL DEFAULT 'OWNED',
  "monthlyRent" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "tenantName" TEXT,
  "leaseExpiry" TIMESTAMPTZ,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PropertyAudit" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "auditNo" TEXT UNIQUE NOT NULL,
  "ownerName" TEXT,
  address TEXT,
  "areaSqm" NUMERIC(18,2),
  zone TEXT,
  "annualTax" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "lastAuditYear" INTEGER,
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CrisisEvent" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  "crisisType" TEXT,
  location TEXT,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "reportedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "resolvedAt" TIMESTAMPTZ,
  description TEXT,
  casualties INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CrisisAction" (
  id TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "actionDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT NOT NULL,
  "responsibleTeam" TEXT,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ParkingLot" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  "hourlyRate" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ParkingSession" (
  id TEXT PRIMARY KEY,
  "lotId" TEXT NOT NULL,
  "plateNo" TEXT NOT NULL,
  "enteredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "exitedAt" TIMESTAMPTZ,
  fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "StreetLight" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "lightCode" TEXT UNIQUE NOT NULL,
  address TEXT,
  zone TEXT,
  "lightType" TEXT,
  "installDate" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'WORKING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "StreetLightReport" (
  id TEXT PRIMARY KEY,
  "lightId" TEXT NOT NULL,
  "reportDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  fault TEXT,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "fixedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CouncilMeeting" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  "meetingDate" TIMESTAMPTZ NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  agenda TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CouncilDecision" (
  id TEXT PRIMARY KEY,
  "meetingId" TEXT NOT NULL,
  "decisionNo" INTEGER,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  deadline TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "HelpTicket" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "ticketNo" TEXT UNIQUE NOT NULL,
  category TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT,
  "slaHours" INTEGER NOT NULL DEFAULT 24,
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TrainingCourse" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  instructor TEXT,
  hours INTEGER NOT NULL DEFAULT 0,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TrainingEnrollment" (
  id TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  score NUMERIC(18,2),
  passed BOOLEAN NOT NULL DEFAULT false,
  "certUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DocumentFolder" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Document" (
  id TEXT PRIMARY KEY,
  "folderId" TEXT NOT NULL,
  title TEXT NOT NULL,
  "fileUrl" TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  tags TEXT,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Appointment" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "serviceUnit" TEXT NOT NULL,
  "customerId" TEXT,
  "appointmentDate" TIMESTAMPTZ NOT NULL,
  slot TEXT,
  status TEXT NOT NULL DEFAULT 'BOOKED',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Survey" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SurveyQuestion" (
  id TEXT PRIMARY KEY,
  "surveyId" TEXT NOT NULL,
  text TEXT NOT NULL,
  qtype TEXT NOT NULL DEFAULT 'text',
  options TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
  id TEXT PRIMARY KEY,
  "surveyId" TEXT NOT NULL,
  "respondentName" TEXT,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SurveyAnswer" (
  id TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "responseId" TEXT NOT NULL,
  value TEXT
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "userEmail" TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  "entityId" TEXT,
  "oldValue" TEXT,
  "newValue" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ClinicRecord" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT,
  "patientName" TEXT NOT NULL,
  "visitDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "visitType" TEXT NOT NULL DEFAULT 'CHECKUP',
  diagnosis TEXT,
  prescription TEXT,
  "doctorName" TEXT,
  cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "IotSensor" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "sensorCode" TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'OTHER',
  location TEXT,
  lat NUMERIC(18,2),
  lng NUMERIC(18,2),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  threshold NUMERIC(18,2),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SensorReading" (
  id TEXT PRIMARY KEY,
  "sensorId" TEXT NOT NULL,
  value NUMERIC(18,2) NOT NULL,
  unit TEXT,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SensorAlert" (
  id TEXT PRIMARY KEY,
  "sensorId" TEXT NOT NULL,
  value NUMERIC(18,2) NOT NULL,
  message TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CctvCamera" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "cameraCode" TEXT UNIQUE NOT NULL,
  location TEXT,
  zone TEXT,
  "streamUrl" TEXT,
  status TEXT NOT NULL DEFAULT 'WORKING',
  "installDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CctvReport" (
  id TEXT PRIMARY KEY,
  "cameraId" TEXT NOT NULL,
  fault TEXT NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "fixedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UtilityMeter" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "meterNo" TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'WATER',
  address TEXT,
  "ownerName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UtilityReading" (
  id TEXT PRIMARY KEY,
  "meterId" TEXT NOT NULL,
  "readDate" TIMESTAMPTZ NOT NULL,
  value NUMERIC(18,2) NOT NULL,
  reader TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UtilityBill" (
  id TEXT PRIMARY KEY,
  "meterId" TEXT NOT NULL,
  period TEXT NOT NULL,
  usage NUMERIC(18,2) NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NewsPost" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  "imageUrl" TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMPTZ,
  "authorName" TEXT,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Loan" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "loanNo" TEXT UNIQUE NOT NULL,
  "borrowerName" TEXT NOT NULL,
  "borrowerType" TEXT NOT NULL DEFAULT 'employee',
  "borrowerId" TEXT,
  amount NUMERIC(18,2) NOT NULL,
  "interestRate" NUMERIC(18,2) NOT NULL DEFAULT 0,
  months INTEGER NOT NULL DEFAULT 12,
  "startDate" TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "LoanRepayment" (
  id TEXT PRIMARY KEY,
  "loanId" TEXT NOT NULL,
  "dueDate" TIMESTAMPTZ NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  "paidAt" TIMESTAMPTZ,
  "isPaid" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "Investment" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'OTHER',
  principal NUMERIC(18,2) NOT NULL,
  "currentValue" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "returnRate" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMPTZ NOT NULL,
  "maturityDate" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Webhook" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'CUSTOM',
  url TEXT NOT NULL,
  secret TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "WebhookLog" (
  id TEXT PRIMARY KEY,
  "webhookId" TEXT NOT NULL,
  payload TEXT,
  status INTEGER NOT NULL DEFAULT 200,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ProductReturn" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "returnNo" TEXT UNIQUE NOT NULL,
  "saleId" TEXT,
  "customerId" TEXT,
  reason TEXT NOT NULL DEFAULT 'OTHER',
  status TEXT NOT NULL DEFAULT 'PENDING',
  "totalAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ProductReturnItem" (
  id TEXT PRIMARY KEY,
  "returnId" TEXT NOT NULL,
  "productId" TEXT,
  name TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL,
  "unitPrice" NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Shipment" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "trackingNo" TEXT UNIQUE NOT NULL,
  "saleId" TEXT,
  carrier TEXT,
  method TEXT,
  fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  "estimatedAt" TIMESTAMPTZ,
  "deliveredAt" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  address TEXT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ShipmentItem" (
  id TEXT PRIMARY KEY,
  "shipmentId" TEXT NOT NULL,
  "productId" TEXT,
  name TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "SerialNumber" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  serial TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_STOCK',
  "saleId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BatchNumber" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "batchNo" TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL,
  "expiryDate" TIMESTAMPTZ,
  "manufactureDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PriceLevel" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ProductPrice" (
  id TEXT PRIMARY KEY,
  "priceLevelId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  price NUMERIC(18,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DiscountRule" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'PERCENT',
  value NUMERIC(18,2) NOT NULL,
  "minQty" INTEGER NOT NULL DEFAULT 0,
  "minAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "getQty" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  code TEXT,
  "maxUses" INTEGER NOT NULL DEFAULT 0,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Project" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "projectNo" TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  "clientName" TEXT,
  budget NUMERIC(18,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PLANNING',
  progress INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ProjectTask" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  title TEXT NOT NULL,
  "assigneeId" TEXT,
  status TEXT NOT NULL DEFAULT 'TODO',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  "dueDate" TIMESTAMPTZ,
  "estimatedHours" NUMERIC(18,2) NOT NULL DEFAULT 0,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT,
  date TIMESTAMPTZ NOT NULL,
  hours NUMERIC(18,2) NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SalesAgent" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  territory TEXT,
  "commissionRate" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "monthlyTarget" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Quotation" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "quoteNo" TEXT UNIQUE NOT NULL,
  "customerId" TEXT,
  "validUntil" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  "totalAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "QuotationItem" (
  id TEXT PRIMARY KEY,
  "quotationId" TEXT NOT NULL,
  "productId" TEXT,
  name TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL,
  "unitPrice" NUMERIC(18,2) NOT NULL,
  total NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "CustomerTicket" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "ticketNo" TEXT UNIQUE NOT NULL,
  "customerId" TEXT,
  subject TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  rating INTEGER,
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TicketMessage" (
  id TEXT PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  body TEXT NOT NULL,
  "isAgent" BOOLEAN NOT NULL DEFAULT false,
  "senderName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "EmailCampaign" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMPTZ,
  "sentAt" TIMESTAMPTZ,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "EmailRecipient" (
  id TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  "isOpened" BOOLEAN NOT NULL DEFAULT false,
  "isClicked" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "ApiKey" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "keyHash" TEXT UNIQUE NOT NULL,
  prefix TEXT NOT NULL,
  scopes TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "HealthCheckLog" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  service TEXT NOT NULL,
  status TEXT NOT NULL,
  "latencyMs" INTEGER,
  message TEXT,
  "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "RestaurantArea" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  floor TEXT,
  "isSmoking" BOOLEAN NOT NULL DEFAULT false,
  "isOutdoor" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "RestaurantTable" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "areaId" TEXT,
  "tableNo" TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'FREE',
  "qrCode" TEXT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "MenuCategory" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "nameEn" TEXT,
  "nameAr" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "MenuItem" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "categoryId" TEXT,
  code TEXT,
  name TEXT NOT NULL,
  "nameEn" TEXT,
  "nameAr" TEXT,
  description TEXT,
  "imageUrl" TEXT,
  price NUMERIC(18,2) NOT NULL,
  cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  "taxRate" NUMERIC(18,2),
  station TEXT NOT NULL DEFAULT 'KITCHEN',
  "prepMinutes" INTEGER NOT NULL DEFAULT 10,
  calories INTEGER,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "isSpicy" BOOLEAN NOT NULL DEFAULT false,
  "isVegan" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "MenuRecipe" (
  id TEXT PRIMARY KEY,
  "menuItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL,
  unit TEXT,
  "wastePct" NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "RestaurantOrder" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "orderNo" TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'DINE_IN',
  status TEXT NOT NULL DEFAULT 'OPEN',
  "tableId" TEXT,
  "customerId" TEXT,
  "waiterId" TEXT,
  "guestCount" INTEGER NOT NULL DEFAULT 1,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  "serviceCharge" NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  "paidAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "tipAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "paymentMethod" TEXT,
  "deliveryAddress" TEXT,
  "deliveryPhone" TEXT,
  "deliveryFee" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "courierName" TEXT,
  "saleId" TEXT,
  note TEXT,
  "openedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "kitchenAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "RestaurantOrderItem" (
  id TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "menuItemId" TEXT,
  name TEXT NOT NULL,
  qty NUMERIC(18,2) NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(18,2) NOT NULL,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  station TEXT NOT NULL DEFAULT 'KITCHEN',
  note TEXT,
  "sentAt" TIMESTAMPTZ,
  "readyAt" TIMESTAMPTZ,
  "servedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TableReservation" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "tableId" TEXT,
  "customerName" TEXT NOT NULL,
  phone TEXT,
  guests INTEGER NOT NULL DEFAULT 2,
  "reservedAt" TIMESTAMPTZ NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'PENDING',
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "RestaurantShift" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "endedAt" TIMESTAMPTZ,
  "openingCash" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "closingCash" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "totalSales" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "tipsAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "ordersCount" INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"(id) ON DELETE SET NULL;
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"(id) ON DELETE SET NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"(id) ON DELETE SET NULL;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id) ON DELETE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"(id) ON DELETE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id) ON DELETE CASCADE;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"(id) ON DELETE CASCADE;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE SET NULL;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id) ON DELETE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "CashBox" ADD CONSTRAINT "CashBox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE SET NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"(id) ON DELETE SET NULL;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "BuildingPermit" ADD CONSTRAINT "BuildingPermit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TechnicalInspection" ADD CONSTRAINT "TechnicalInspection_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "BuildingPermit"(id) ON DELETE CASCADE;
ALTER TABLE "BuildingViolation" ADD CONSTRAINT "BuildingViolation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FireStation" ADD CONSTRAINT "FireStation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FireFighter" ADD CONSTRAINT "FireFighter_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FireStation"(id) ON DELETE CASCADE;
ALTER TABLE "FireVehicle" ADD CONSTRAINT "FireVehicle_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FireStation"(id) ON DELETE CASCADE;
ALTER TABLE "FireIncident" ADD CONSTRAINT "FireIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FireIncident" ADD CONSTRAINT "FireIncident_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FireStation"(id) ON DELETE SET NULL;
ALTER TABLE "SafetyInspection" ADD CONSTRAINT "SafetyInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CitizenComplaint" ADD CONSTRAINT "CitizenComplaint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "MunicipalBill" ADD CONSTRAINT "MunicipalBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "MunicipalBill" ADD CONSTRAINT "MunicipalBill_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "BuildingPermit"(id) ON DELETE SET NULL;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE SET NULL;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PosTerminal" ADD CONSTRAINT "PosTerminal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PosTerminal" ADD CONSTRAINT "PosTerminal_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"(id) ON DELETE SET NULL;
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TreasuryAccount"(id) ON DELETE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ContractPayment" ADD CONSTRAINT "ContractPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"(id) ON DELETE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"(id) ON DELETE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TenderBid" ADD CONSTRAINT "TenderBid_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"(id) ON DELETE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE CASCADE;
ALTER TABLE "ConstructionProject" ADD CONSTRAINT "ConstructionProject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FleetVehicle" ADD CONSTRAINT "FleetVehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FleetService" ADD CONSTRAINT "FleetService_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"(id) ON DELETE CASCADE;
ALTER TABLE "FleetFuelLog" ADD CONSTRAINT "FleetFuelLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"(id) ON DELETE CASCADE;
ALTER TABLE "ServiceZone" ADD CONSTRAINT "ServiceZone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ZoneWorkLog" ADD CONSTRAINT "ZoneWorkLog_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ServiceZone"(id) ON DELETE CASCADE;
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE SET NULL;
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"(id) ON DELETE CASCADE;
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE SET NULL;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"(id) ON DELETE CASCADE;
ALTER TABLE "CitizenProfile" ADD CONSTRAINT "CitizenProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CityServiceRequest" ADD CONSTRAINT "CityServiceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CityServiceRequest" ADD CONSTRAINT "CityServiceRequest_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "CitizenProfile"(id) ON DELETE SET NULL;
ALTER TABLE "CityAnnouncement" ADD CONSTRAINT "CityAnnouncement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Cemetery" ADD CONSTRAINT "Cemetery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Grave" ADD CONSTRAINT "Grave_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "Cemetery"(id) ON DELETE CASCADE;
ALTER TABLE "BurialPermit" ADD CONSTRAINT "BurialPermit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "BurialPermit" ADD CONSTRAINT "BurialPermit_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "Cemetery"(id) ON DELETE SET NULL;
ALTER TABLE "TaxiDriver" ADD CONSTRAINT "TaxiDriver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TaxiViolation" ADD CONSTRAINT "TaxiViolation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TaxiDriver"(id) ON DELETE CASCADE;
ALTER TABLE "BusinessLicense" ADD CONSTRAINT "BusinessLicense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "GuildInspection" ADD CONSTRAINT "GuildInspection_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "BusinessLicense"(id) ON DELETE CASCADE;
ALTER TABLE "MunicipalProperty" ADD CONSTRAINT "MunicipalProperty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PropertyAudit" ADD CONSTRAINT "PropertyAudit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CrisisEvent" ADD CONSTRAINT "CrisisEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CrisisAction" ADD CONSTRAINT "CrisisAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CrisisEvent"(id) ON DELETE CASCADE;
ALTER TABLE "ParkingLot" ADD CONSTRAINT "ParkingLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ParkingSession" ADD CONSTRAINT "ParkingSession_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "ParkingLot"(id) ON DELETE CASCADE;
ALTER TABLE "StreetLight" ADD CONSTRAINT "StreetLight_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "StreetLightReport" ADD CONSTRAINT "StreetLightReport_lightId_fkey" FOREIGN KEY ("lightId") REFERENCES "StreetLight"(id) ON DELETE CASCADE;
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CouncilDecision" ADD CONSTRAINT "CouncilDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "CouncilMeeting"(id) ON DELETE CASCADE;
ALTER TABLE "HelpTicket" ADD CONSTRAINT "HelpTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "HelpTicket" ADD CONSTRAINT "HelpTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"(id) ON DELETE SET NULL;
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"(id) ON DELETE CASCADE;
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE CASCADE;
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentFolder"(id) ON DELETE SET NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"(id) ON DELETE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE SET NULL;
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"(id) ON DELETE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"(id) ON DELETE CASCADE;
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"(id) ON DELETE CASCADE;
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"(id) ON DELETE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ClinicRecord" ADD CONSTRAINT "ClinicRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "IotSensor" ADD CONSTRAINT "IotSensor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "IotSensor"(id) ON DELETE CASCADE;
ALTER TABLE "SensorAlert" ADD CONSTRAINT "SensorAlert_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "IotSensor"(id) ON DELETE CASCADE;
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CctvReport" ADD CONSTRAINT "CctvReport_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"(id) ON DELETE CASCADE;
ALTER TABLE "UtilityMeter" ADD CONSTRAINT "UtilityMeter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "UtilityReading" ADD CONSTRAINT "UtilityReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "UtilityMeter"(id) ON DELETE CASCADE;
ALTER TABLE "UtilityBill" ADD CONSTRAINT "UtilityBill_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "UtilityMeter"(id) ON DELETE CASCADE;
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"(id) ON DELETE CASCADE;
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"(id) ON DELETE CASCADE;
ALTER TABLE "ProductReturn" ADD CONSTRAINT "ProductReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ProductReturnItem" ADD CONSTRAINT "ProductReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ProductReturn"(id) ON DELETE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"(id) ON DELETE CASCADE;
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "BatchNumber" ADD CONSTRAINT "BatchNumber_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "BatchNumber" ADD CONSTRAINT "BatchNumber_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "PriceLevel" ADD CONSTRAINT "PriceLevel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "PriceLevel"(id) ON DELETE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE SET NULL;
ALTER TABLE "SalesAgent" ADD CONSTRAINT "SalesAgent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"(id) ON DELETE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE SET NULL;
ALTER TABLE "CustomerTicket" ADD CONSTRAINT "CustomerTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CustomerTicket" ADD CONSTRAINT "CustomerTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE SET NULL;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CustomerTicket"(id) ON DELETE CASCADE;
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "EmailRecipient" ADD CONSTRAINT "EmailRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"(id) ON DELETE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "HealthCheckLog" ADD CONSTRAINT "HealthCheckLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantArea" ADD CONSTRAINT "RestaurantArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "RestaurantArea"(id) ON DELETE SET NULL;
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"(id) ON DELETE SET NULL;
ALTER TABLE "MenuRecipe" ADD CONSTRAINT "MenuRecipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"(id) ON DELETE CASCADE;
ALTER TABLE "MenuRecipe" ADD CONSTRAINT "MenuRecipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"(id) ON DELETE SET NULL;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE SET NULL;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"(id) ON DELETE SET NULL;
ALTER TABLE "TableReservation" ADD CONSTRAINT "TableReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TableReservation" ADD CONSTRAINT "TableReservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"(id) ON DELETE SET NULL;
ALTER TABLE "RestaurantShift" ADD CONSTRAINT "RestaurantShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "RestaurantShift" ADD CONSTRAINT "RestaurantShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Warehouse_companyId_idx" ON "Warehouse" ("companyId");
CREATE INDEX IF NOT EXISTS "Category_companyId_idx" ON "Category" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_sku_key" ON "Product" ("companyId", sku);
CREATE INDEX IF NOT EXISTS "Product_companyId_idx" ON "Product" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_warehouseId_productId_key" ON "Inventory" ("warehouseId", "productId");
CREATE INDEX IF NOT EXISTS "Purchase_companyId_idx" ON "Purchase" ("companyId");
CREATE INDEX IF NOT EXISTS "Sale_companyId_idx" ON "Sale" ("companyId");
CREATE INDEX IF NOT EXISTS "CashBox_companyId_idx" ON "CashBox" ("companyId");
CREATE INDEX IF NOT EXISTS "Payment_saleId_idx" ON "Payment" ("saleId");
CREATE INDEX IF NOT EXISTS "Expense_companyId_idx" ON "Expense" ("companyId");
CREATE INDEX IF NOT EXISTS "Account_companyId_idx" ON "Account" ("companyId");
CREATE INDEX IF NOT EXISTS "BuildingPermit_companyId_idx" ON "BuildingPermit" ("companyId");
CREATE INDEX IF NOT EXISTS "BuildingPermit_status_idx" ON "BuildingPermit" (status);
CREATE INDEX IF NOT EXISTS "TechnicalInspection_permitId_idx" ON "TechnicalInspection" ("permitId");
CREATE INDEX IF NOT EXISTS "BuildingViolation_companyId_idx" ON "BuildingViolation" ("companyId");
CREATE INDEX IF NOT EXISTS "BuildingViolation_status_idx" ON "BuildingViolation" (status);
CREATE INDEX IF NOT EXISTS "FireStation_companyId_idx" ON "FireStation" ("companyId");
CREATE INDEX IF NOT EXISTS "FireFighter_stationId_idx" ON "FireFighter" ("stationId");
CREATE INDEX IF NOT EXISTS "FireVehicle_stationId_idx" ON "FireVehicle" ("stationId");
CREATE INDEX IF NOT EXISTS "FireIncident_companyId_idx" ON "FireIncident" ("companyId");
CREATE INDEX IF NOT EXISTS "FireIncident_stationId_idx" ON "FireIncident" ("stationId");
CREATE INDEX IF NOT EXISTS "FireIncident_status_idx" ON "FireIncident" (status);
CREATE INDEX IF NOT EXISTS "SafetyInspection_companyId_idx" ON "SafetyInspection" ("companyId");
CREATE INDEX IF NOT EXISTS "SafetyInspection_result_idx" ON "SafetyInspection" (result);
CREATE INDEX IF NOT EXISTS "CitizenComplaint_companyId_idx" ON "CitizenComplaint" ("companyId");
CREATE INDEX IF NOT EXISTS "CitizenComplaint_status_idx" ON "CitizenComplaint" (status);
CREATE INDEX IF NOT EXISTS "MunicipalBill_companyId_idx" ON "MunicipalBill" ("companyId");
CREATE INDEX IF NOT EXISTS "MunicipalBill_status_idx" ON "MunicipalBill" (status);
CREATE INDEX IF NOT EXISTS "Cheque_companyId_idx" ON "Cheque" ("companyId");
CREATE INDEX IF NOT EXISTS "Cheque_status_idx" ON "Cheque" (status);
CREATE INDEX IF NOT EXISTS "Cheque_dueDate_idx" ON "Cheque" ("dueDate");
CREATE INDEX IF NOT EXISTS "Installment_saleId_idx" ON "Installment" ("saleId");
CREATE INDEX IF NOT EXISTS "Attachment_companyId_idx" ON "Attachment" ("companyId");
CREATE INDEX IF NOT EXISTS "Attachment_entityType_entityId_idx" ON "Attachment" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "PosTerminal_companyId_idx" ON "PosTerminal" ("companyId");
CREATE INDEX IF NOT EXISTS "TreasuryAccount_companyId_idx" ON "TreasuryAccount" ("companyId");
CREATE INDEX IF NOT EXISTS "TreasuryTransaction_companyId_idx" ON "TreasuryTransaction" ("companyId");
CREATE INDEX IF NOT EXISTS "TreasuryTransaction_accountId_idx" ON "TreasuryTransaction" ("accountId");
CREATE INDEX IF NOT EXISTS "TreasuryTransaction_date_idx" ON "TreasuryTransaction" (date);
CREATE INDEX IF NOT EXISTS "Contract_companyId_idx" ON "Contract" ("companyId");
CREATE INDEX IF NOT EXISTS "Contract_status_idx" ON "Contract" (status);
CREATE INDEX IF NOT EXISTS "Contract_endDate_idx" ON "Contract" ("endDate");
CREATE INDEX IF NOT EXISTS "ContractPayment_contractId_idx" ON "ContractPayment" ("contractId");
CREATE INDEX IF NOT EXISTS "ContractPayment_dueDate_idx" ON "ContractPayment" ("dueDate");
CREATE INDEX IF NOT EXISTS "Employee_companyId_idx" ON "Employee" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSlip_employeeId_period_key" ON "PayrollSlip" ("employeeId", period);
CREATE INDEX IF NOT EXISTS "PayrollSlip_companyId_idx" ON "PayrollSlip" ("companyId");
CREATE INDEX IF NOT EXISTS "PayrollSlip_period_idx" ON "PayrollSlip" (period);
CREATE INDEX IF NOT EXISTS "Budget_companyId_idx" ON "Budget" ("companyId");
CREATE INDEX IF NOT EXISTS "BudgetLine_budgetId_idx" ON "BudgetLine" ("budgetId");
CREATE INDEX IF NOT EXISTS "Asset_companyId_idx" ON "Asset" ("companyId");
CREATE INDEX IF NOT EXISTS "Tender_companyId_idx" ON "Tender" ("companyId");
CREATE INDEX IF NOT EXISTS "TenderBid_tenderId_idx" ON "TenderBid" ("tenderId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_companyId_idx" ON "AttendanceRecord" ("companyId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_employeeId_idx" ON "AttendanceRecord" ("employeeId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_companyId_idx" ON "LeaveRequest" ("companyId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_employeeId_idx" ON "LeaveRequest" ("employeeId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_companyId_idx" ON "PerformanceReview" ("companyId");
CREATE INDEX IF NOT EXISTS "PerformanceReview_employeeId_idx" ON "PerformanceReview" ("employeeId");
CREATE INDEX IF NOT EXISTS "ConstructionProject_companyId_idx" ON "ConstructionProject" ("companyId");
CREATE INDEX IF NOT EXISTS "FleetVehicle_companyId_idx" ON "FleetVehicle" ("companyId");
CREATE INDEX IF NOT EXISTS "FleetService_vehicleId_idx" ON "FleetService" ("vehicleId");
CREATE INDEX IF NOT EXISTS "FleetFuelLog_vehicleId_idx" ON "FleetFuelLog" ("vehicleId");
CREATE INDEX IF NOT EXISTS "ServiceZone_companyId_idx" ON "ServiceZone" ("companyId");
CREATE INDEX IF NOT EXISTS "ZoneWorkLog_zoneId_idx" ON "ZoneWorkLog" ("zoneId");
CREATE INDEX IF NOT EXISTS "Letter_companyId_idx" ON "Letter" ("companyId");
CREATE INDEX IF NOT EXISTS "LoyaltyAccount_companyId_idx" ON "LoyaltyAccount" ("companyId");
CREATE INDEX IF NOT EXISTS "Coupon_companyId_idx" ON "Coupon" ("companyId");
CREATE INDEX IF NOT EXISTS "SalesOrder_companyId_idx" ON "SalesOrder" ("companyId");
CREATE INDEX IF NOT EXISTS "SalesOrderItem_orderId_idx" ON "SalesOrderItem" ("orderId");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_companyId_idx" ON "ApprovalRequest" ("companyId");
CREATE INDEX IF NOT EXISTS "ApprovalStep_requestId_idx" ON "ApprovalStep" ("requestId");
CREATE INDEX IF NOT EXISTS "CitizenProfile_companyId_idx" ON "CitizenProfile" ("companyId");
CREATE INDEX IF NOT EXISTS "CityServiceRequest_companyId_idx" ON "CityServiceRequest" ("companyId");
CREATE INDEX IF NOT EXISTS "CityAnnouncement_companyId_idx" ON "CityAnnouncement" ("companyId");
CREATE INDEX IF NOT EXISTS "Cemetery_companyId_idx" ON "Cemetery" ("companyId");
CREATE INDEX IF NOT EXISTS "Grave_cemeteryId_idx" ON "Grave" ("cemeteryId");
CREATE INDEX IF NOT EXISTS "BurialPermit_companyId_idx" ON "BurialPermit" ("companyId");
CREATE INDEX IF NOT EXISTS "TaxiDriver_companyId_idx" ON "TaxiDriver" ("companyId");
CREATE INDEX IF NOT EXISTS "TaxiViolation_driverId_idx" ON "TaxiViolation" ("driverId");
CREATE INDEX IF NOT EXISTS "BusinessLicense_companyId_idx" ON "BusinessLicense" ("companyId");
CREATE INDEX IF NOT EXISTS "GuildInspection_licenseId_idx" ON "GuildInspection" ("licenseId");
CREATE INDEX IF NOT EXISTS "MunicipalProperty_companyId_idx" ON "MunicipalProperty" ("companyId");
CREATE INDEX IF NOT EXISTS "PropertyAudit_companyId_idx" ON "PropertyAudit" ("companyId");
CREATE INDEX IF NOT EXISTS "CrisisEvent_companyId_idx" ON "CrisisEvent" ("companyId");
CREATE INDEX IF NOT EXISTS "CrisisAction_eventId_idx" ON "CrisisAction" ("eventId");
CREATE INDEX IF NOT EXISTS "ParkingLot_companyId_idx" ON "ParkingLot" ("companyId");
CREATE INDEX IF NOT EXISTS "ParkingSession_lotId_idx" ON "ParkingSession" ("lotId");
CREATE INDEX IF NOT EXISTS "StreetLight_companyId_idx" ON "StreetLight" ("companyId");
CREATE INDEX IF NOT EXISTS "StreetLightReport_lightId_idx" ON "StreetLightReport" ("lightId");
CREATE INDEX IF NOT EXISTS "CouncilMeeting_companyId_idx" ON "CouncilMeeting" ("companyId");
CREATE INDEX IF NOT EXISTS "CouncilDecision_meetingId_idx" ON "CouncilDecision" ("meetingId");
CREATE INDEX IF NOT EXISTS "HelpTicket_companyId_idx" ON "HelpTicket" ("companyId");
CREATE INDEX IF NOT EXISTS "TrainingCourse_companyId_idx" ON "TrainingCourse" ("companyId");
CREATE INDEX IF NOT EXISTS "TrainingEnrollment_courseId_idx" ON "TrainingEnrollment" ("courseId");
CREATE INDEX IF NOT EXISTS "TrainingEnrollment_employeeId_idx" ON "TrainingEnrollment" ("employeeId");
CREATE INDEX IF NOT EXISTS "DocumentFolder_companyId_idx" ON "DocumentFolder" ("companyId");
CREATE INDEX IF NOT EXISTS "Document_folderId_idx" ON "Document" ("folderId");
CREATE INDEX IF NOT EXISTS "Appointment_companyId_idx" ON "Appointment" ("companyId");
CREATE INDEX IF NOT EXISTS "Survey_companyId_idx" ON "Survey" ("companyId");
CREATE INDEX IF NOT EXISTS "SurveyQuestion_surveyId_idx" ON "SurveyQuestion" ("surveyId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyId_idx" ON "SurveyResponse" ("surveyId");
CREATE INDEX IF NOT EXISTS "SurveyAnswer_questionId_idx" ON "SurveyAnswer" ("questionId");
CREATE INDEX IF NOT EXISTS "SurveyAnswer_responseId_idx" ON "SurveyAnswer" ("responseId");
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_idx" ON "AuditLog" ("companyId");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_idx" ON "AuditLog" (entity);
CREATE INDEX IF NOT EXISTS "ClinicRecord_companyId_idx" ON "ClinicRecord" ("companyId");
CREATE INDEX IF NOT EXISTS "IotSensor_companyId_idx" ON "IotSensor" ("companyId");
CREATE INDEX IF NOT EXISTS "SensorReading_sensorId_idx" ON "SensorReading" ("sensorId");
CREATE INDEX IF NOT EXISTS "SensorAlert_sensorId_idx" ON "SensorAlert" ("sensorId");
CREATE INDEX IF NOT EXISTS "CctvCamera_companyId_idx" ON "CctvCamera" ("companyId");
CREATE INDEX IF NOT EXISTS "CctvReport_cameraId_idx" ON "CctvReport" ("cameraId");
CREATE INDEX IF NOT EXISTS "UtilityMeter_companyId_idx" ON "UtilityMeter" ("companyId");
CREATE INDEX IF NOT EXISTS "UtilityReading_meterId_idx" ON "UtilityReading" ("meterId");
CREATE INDEX IF NOT EXISTS "UtilityBill_meterId_idx" ON "UtilityBill" ("meterId");
CREATE INDEX IF NOT EXISTS "NewsPost_companyId_idx" ON "NewsPost" ("companyId");
CREATE INDEX IF NOT EXISTS "Loan_companyId_idx" ON "Loan" ("companyId");
CREATE INDEX IF NOT EXISTS "LoanRepayment_loanId_idx" ON "LoanRepayment" ("loanId");
CREATE INDEX IF NOT EXISTS "Investment_companyId_idx" ON "Investment" ("companyId");
CREATE INDEX IF NOT EXISTS "Webhook_companyId_idx" ON "Webhook" ("companyId");
CREATE INDEX IF NOT EXISTS "WebhookLog_webhookId_idx" ON "WebhookLog" ("webhookId");
CREATE INDEX IF NOT EXISTS "ProductReturn_companyId_idx" ON "ProductReturn" ("companyId");
CREATE INDEX IF NOT EXISTS "ProductReturnItem_returnId_idx" ON "ProductReturnItem" ("returnId");
CREATE INDEX IF NOT EXISTS "Shipment_companyId_idx" ON "Shipment" ("companyId");
CREATE INDEX IF NOT EXISTS "ShipmentItem_shipmentId_idx" ON "ShipmentItem" ("shipmentId");
CREATE INDEX IF NOT EXISTS "SerialNumber_companyId_idx" ON "SerialNumber" ("companyId");
CREATE INDEX IF NOT EXISTS "SerialNumber_productId_idx" ON "SerialNumber" ("productId");
CREATE INDEX IF NOT EXISTS "BatchNumber_companyId_idx" ON "BatchNumber" ("companyId");
CREATE INDEX IF NOT EXISTS "BatchNumber_productId_idx" ON "BatchNumber" ("productId");
CREATE INDEX IF NOT EXISTS "PriceLevel_companyId_idx" ON "PriceLevel" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrice_priceLevelId_productId_key" ON "ProductPrice" ("priceLevelId", "productId");
CREATE INDEX IF NOT EXISTS "ProductPrice_productId_idx" ON "ProductPrice" ("productId");
CREATE INDEX IF NOT EXISTS "DiscountRule_companyId_idx" ON "DiscountRule" ("companyId");
CREATE INDEX IF NOT EXISTS "Project_companyId_idx" ON "Project" ("companyId");
CREATE INDEX IF NOT EXISTS "ProjectTask_projectId_idx" ON "ProjectTask" ("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntry_projectId_idx" ON "TimeEntry" ("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntry_companyId_idx" ON "TimeEntry" ("companyId");
CREATE INDEX IF NOT EXISTS "SalesAgent_companyId_idx" ON "SalesAgent" ("companyId");
CREATE INDEX IF NOT EXISTS "Quotation_companyId_idx" ON "Quotation" ("companyId");
CREATE INDEX IF NOT EXISTS "QuotationItem_quotationId_idx" ON "QuotationItem" ("quotationId");
CREATE INDEX IF NOT EXISTS "CustomerTicket_companyId_idx" ON "CustomerTicket" ("companyId");
CREATE INDEX IF NOT EXISTS "TicketMessage_ticketId_idx" ON "TicketMessage" ("ticketId");
CREATE INDEX IF NOT EXISTS "EmailCampaign_companyId_idx" ON "EmailCampaign" ("companyId");
CREATE INDEX IF NOT EXISTS "EmailRecipient_campaignId_idx" ON "EmailRecipient" ("campaignId");
CREATE INDEX IF NOT EXISTS "ApiKey_companyId_idx" ON "ApiKey" ("companyId");
CREATE INDEX IF NOT EXISTS "HealthCheckLog_companyId_idx" ON "HealthCheckLog" ("companyId");
CREATE INDEX IF NOT EXISTS "RestaurantArea_companyId_idx" ON "RestaurantArea" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantTable_companyId_tableNo_key" ON "RestaurantTable" ("companyId", "tableNo");
CREATE INDEX IF NOT EXISTS "RestaurantTable_companyId_idx" ON "RestaurantTable" ("companyId");
CREATE INDEX IF NOT EXISTS "MenuCategory_companyId_idx" ON "MenuCategory" ("companyId");
CREATE INDEX IF NOT EXISTS "MenuItem_companyId_idx" ON "MenuItem" ("companyId");
CREATE INDEX IF NOT EXISTS "MenuItem_categoryId_idx" ON "MenuItem" ("categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "MenuRecipe_menuItemId_productId_key" ON "MenuRecipe" ("menuItemId", "productId");
CREATE INDEX IF NOT EXISTS "MenuRecipe_menuItemId_idx" ON "MenuRecipe" ("menuItemId");
CREATE INDEX IF NOT EXISTS "RestaurantOrder_companyId_idx" ON "RestaurantOrder" ("companyId");
CREATE INDEX IF NOT EXISTS "RestaurantOrder_tableId_idx" ON "RestaurantOrder" ("tableId");
CREATE INDEX IF NOT EXISTS "RestaurantOrder_status_idx" ON "RestaurantOrder" (status);
CREATE INDEX IF NOT EXISTS "RestaurantOrderItem_orderId_idx" ON "RestaurantOrderItem" ("orderId");
CREATE INDEX IF NOT EXISTS "RestaurantOrderItem_status_idx" ON "RestaurantOrderItem" (status);
CREATE INDEX IF NOT EXISTS "TableReservation_companyId_idx" ON "TableReservation" ("companyId");
CREATE INDEX IF NOT EXISTS "TableReservation_reservedAt_idx" ON "TableReservation" ("reservedAt");
CREATE INDEX IF NOT EXISTS "RestaurantShift_companyId_idx" ON "RestaurantShift" ("companyId");
