# Molido AI Database Standards

## 1. Naming Convention
- Table names: snake_case (example: user_roles)
- Column names: snake_case (example: created_at)
- Primary key: id
- Public identifier: uuid

## 2. Primary Keys
- Use BIGSERIAL for id
- Use UUID for public APIs

## 3. UUID
- Every table must have uuid
- UUID must be UNIQUE
- UUID should be generated automatically

## 4. Audit Fields
Every table must contain:
- created_at
- updated_at
- deleted_at
- created_by
- updated_by
- deleted_by

## 5. Soft Delete
Do not permanently delete records.
Use deleted_at.

## 6. Timestamp
Use TIMESTAMPTZ for all date/time fields.

## 7. Foreign Keys
All relations must use FOREIGN KEY.

## 8. Indexes
Create indexes for:
- Foreign Keys
- Search fields
- Code fields
- Status fields

## 9. Constraints
Use:
- NOT NULL
- UNIQUE
- CHECK
- DEFAULT

## 10. Multi-Tenant
Business tables must support company_id.

## 11. Multi-Branch
Business tables should support branch_id where needed.

## 12. Multi-Language
Support Persian, English and future languages.

## 13. Multi-Currency
Currency must be independent from business logic.

## 14. Security
Never store passwords as plain text.
Only password_hash.

## 15. License
Every module must support online license validation.

## 16. Performance
Avoid duplicate data.
Normalize tables.

## 17. Documentation
Every table must have documentation.

## 18. Migration
Every schema change must have migration.

## 19. Seed Data
System tables should include seed data.

## 20. Future Ready
Database must support future modules without redesign.
