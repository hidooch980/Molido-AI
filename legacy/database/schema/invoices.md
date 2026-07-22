# Invoices Table

## Invoice Fields

- id
- invoice_number
- type
  - Purchase
  - Sale
- customer_id
- supplier_id
- user_id
- invoice_date
- total_amount
- discount
- tax
- final_amount
- payment_status
- created_at
- updated_at

## Invoice Items

- id
- invoice_id
- product_id
- quantity
- unit_price
- total_price
- expiration_date

## Relations

Connected with:
- Products
- Customers
- Suppliers
- Inventory
- Accounting

## AI Data

Used for:
- Sales analysis
- Profit calculation
- Price recommendations
