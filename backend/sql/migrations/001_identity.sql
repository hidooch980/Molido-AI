CREATE TABLE IF NOT EXISTS "Company" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "legalName" TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  "taxNumber" TEXT,
  logo TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EMPLOYEE',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  avatar TEXT,
  "companyId" TEXT REFERENCES "Company"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User" ("companyId");
