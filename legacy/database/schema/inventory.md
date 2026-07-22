# Inventory Table

## Fields

- id
- product_id
- warehouse_id
- quantity
- min_stock
- max_stock
- stock_status
- last_update
- created_at
- updated_at

## Stock Movement

- id
- product_id
- type
  - Purchase
  - Sale
  - Return
  - Adjustment
- quantity
- reference_id
- date

## Relations

Connected with:
- Products
- Invoices
- Warehouses
- AI

## AI Data

Used for:
- Stock prediction
- Low inventory alerts
- Expiration warnings
