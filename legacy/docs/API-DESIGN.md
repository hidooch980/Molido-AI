# Molido AI API Design

## Purpose

ارتباط بین:
- Web Application
- Mobile Application
- Backend
- AI Engine

## Authentication API

### Login
- POST /api/auth/login

### Register
- POST /api/auth/register

### User Profile
- GET /api/users/profile


## Products API

### Get Products
- GET /api/products

### Create Product
- POST /api/products

### Update Product
- PUT /api/products/{id}

### Delete Product
- DELETE /api/products/{id}


## Inventory API

### Current Stock
- GET /api/inventory

### Stock Movement
- POST /api/inventory/movement


## Invoice API

### Sales Invoice
- POST /api/invoices/sale

### Purchase Invoice
- POST /api/invoices/purchase

### Invoice List
- GET /api/invoices


## Accounting API

### Transactions
- GET /api/accounting

### Reports
- GET /api/reports


## AI API

### Business Analysis
- GET /api/ai/analysis

### Smart Suggestions
- GET /api/ai/suggestions

### Alerts
- GET /api/ai/alerts
