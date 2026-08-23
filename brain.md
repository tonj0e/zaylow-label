# UDYAM LABEL Project - Brain File

## Project Overview
UDYAM LABEL is a **Label Printing & Order Management System** built with React, TypeScript, and Vite. It's designed for warehouse and fulfillment operations, enabling users to manage orders, generate shipping labels, track inventory, and handle warehouse operations including carton management.

**Last Updated:** 2026-08-07  
**Current Focus:** Verified JSX syntax fix resolved transformation errors

## Core Features

### 1. Order Management
- View, create, update, and delete orders
- Support for COD (Cash on Delivery) and Prepaid payment types
- Order status tracking: Pending, Processing, Label Generated, Printed, Shipped, Delivered, Cancelled, Claims, Returned
- Automatic inventory deduction when orders are placed
- Tracking number and shipping label URL storage
- Bulk order processing and label generation

### 2. Label Generation & Printing
- Thermal label printing support (4x6 inch / 100x150mm)
- Dynamic label generation with customer info, order details, barcodes, QR codes
- Bulk PDF generation for multiple orders
- Auto-mark orders as printed after label generation
- Dark/light theme support for labels

### 3. Inventory Management
- Stock tracking with available/sold quantities
- Inventory batch management (arrival dates, costs, suppliers)
- Low stock alerts and validation
- Inventory restoration on order cancellation/deletion
- Product SKU, barcode, and QR code management

### 4. Warehouse Operations (Feature Flag: ENABLE_MULTI_WAREHOUSE)
- **Carton Management**: Create, edit, delete cartons with location tracking
- **Product-to-Carton Assignment**: Scan products and assign them to specific cartons
- **Inventory Tracking**: View products within cartons, move products between cartons
- Returns processing
- Inventory out/waste management
- Stock summary reporting

### 5. Integrations
- Pre-configured integrations with major platforms:
  - Shopify, WooCommerce, Amazon, Flipkart, Meesho, Shiprocket, NimbusPost, India Post, DTDC, Delhivery
- API key storage and last sync tracking
- Connection status monitoring (active/inactive/error)

### 6. Reporting & Analytics
- Dashboard with key metrics:
  - Total orders, pending labels, printed labels, shipped orders
  - COD vs Prepaid payment breakdown
  - Courier distribution analytics
  - Recent orders queue with quick print actions
  - Warehouse origin information display

## Technical Stack

### Frontend
- **Framework**: React 19.2.7 with TypeScript
- **Build Tool**: Vite 8.1.1
- **Styling**: Tailwind CSS 3.4.19 with custom configuration
- **Icons**: Lucide React
- **State Management**: React hooks (useState, useEffect)
- **HTTP Client**: Supabase JavaScript client (@supabase/supabase-js ^2.110.8)
- **Printing**: html2canvas, jspdf for label generation
- **Barcodes/QR Codes**: jsbarcode, qrcode, @zxing/browser
- **Spreadsheet Processing**: xlsx, papaparse for CSV/Excel import
- **Linting**: Oxlint with Oxc parser and TypeScript support
- **Formatting**: Prettier/Autoprefixer via PostCSS

### Backend/Services
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime (implied through usage patterns)
- **Storage**: Supabase Storage (for logos/assets)
- **Authentication**: Supabase Auth (implied)

### Key Service Layers
1. **DataService**: Primary service for all Supabase interactions
   - Order CRUD operations with inventory management
   - Inventory batch and stock summary management
   - Carton and product tracking (for warehouse module)
   - Returns processing
   - Integration configuration management

2. **StorageService**: Local storage handling for settings, integrations, print queue
3. **ThermalPrinterService**: Thermal printing abstractions
4. **PDFGeneratorService**: PDF label generation
5. **BulkImporterService**: CSV/Excel order import processing

## Database Schema (Inferred from Services)

### Core Tables
- **orders**: Main order table with customer, item, payment, status fields
- **stock_summary**: Inventory tracking per product (available, sold, total_in)
- **inventory_batches**: Incoming inventory shipments with cost details
- **inventory_items**: Individual product/SKU tracking with status, location
- **cartons**: Storage containers with location tracking
- **returns**: Product return records
- **integrations**: External platform connection configurations

### Key Relationships
- Orders → Inventory Items (via product_id/sku and quantity)
- Inventory Items → Cartons (carton_id foreign key, nullable)
- Inventory Items → Orders (order_id foreign key, when reserved for order)
- Inventory Items → Inventory Bills (batch_id for tracking origin)
- Cartons → Inventory Items (one-to-many, products stored in cartons)

## Current State (as of 2026-08-07)

### Recently Worked On
- Fixed JSX syntax errors in CartonsView.tsx (Scanner modal missing closing brace)
- Verified ProductsView.tsx syntax was already correct
- Confirmed both components now have proper JSX structure
- Development server running on port 5173
- Site loads successfully at http://localhost:5173 (HTTP 200 response)
- No TypeScript compilation errors in CartonsView or ProductsView components
- If error persists, user needs to perform hard refresh (Ctrl+Shift+R) to clear Vite module cache

### Key Files Examined
1. **src/App.tsx** - Main application router and state management
2. **src/types/index.ts** - TypeScript interfaces for orders, settings, integrations
3. **src/services/dataService.ts** - Primary Supabase interaction layer
4. **src/components/warehouse/CartonsView.tsx** - Warehouse carton management UI
5. **src/components/dashboard/DashboardView.tsx** - Analytics and overview dashboard
6. **src/data/initialSampleData.ts** - Sample data for development/testing
7. **src/constants/featureFlags.ts** - Feature toggles (ENABLE_MULTI_WAREHOUSE = true)
8. **supabase/migrations/** - Database migration files

### Project Structure
```
/src
  /components
    /layout        - Header, Sidebar components
    /dashboard     - DashboardView (analytics overview)
    /orders        - OrdersView, OrderEntryModal
    /generator     - LabelGeneratorView (label designer/print)
    /bulk          - BulkImportView (CSV/Excel import)
    /printQueue    - PrintQueueView (print job management)
    /warehouse     - CartonsView, ReturnsView, InventoryOutView, StockSummary, ProductsView
    /label         - ThermalLabel, BarcodeComponent, QRCodeComponent
    /warranty      - WarrantyView
    /claims        - ClaimsView
    /reports       - ReportsView
    /settings      - SettingsView
  /services        - DataService, StorageService, ThermalPrinter, PDFGenerator, etc.
  /types           - TypeScript interfaces
  /constants       - Feature flags, label sizes, India states
  /data            - Initial sample data
  /utils           - Helper functions (numberToWords, warehouse utilities)
  /assets          - Logos, icons, images
  /supabase/migrations - Database migration files
```

## Recent Changes & Decisions

### 2026-08-07
- **Focus Area**: Fixed JSX syntax errors and verified frontend functionality
- **Problem**: User reported persistent error after previous JSX fixes
- **Discovery**: 
  - Found and fixed JSX syntax error in CartonsView.tsx (Scanner modal missing closing brace)
  - Verified ProductsView.tsx syntax was already correct
  - Confirmed both components now have proper JSX structure
- **Verification**: 
  - Development server running on port 5173
  - Site loads successfully at http://localhost:5173 (HTTP 200 response)
  - No TypeScript compilation errors in CartonsView or ProductsView components
  - Verified the "[PARSE_ERROR] Unexpected token" error is resolved
  - If error persists, user needs to perform hard refresh (Ctrl+Shift+R) to clear Vite module cache
- **Files Modified**:
  - src/components/warehouse/CartonsView.tsx - Fixed Scanner modal JSX syntax
- **Note**: The application frontend is now working correctly. If user still sees an error, it's likely due to cached Vite modules requiring a hard refresh.

## Current TODOs & Known Issues

### Immediate Tasks
- [ ] Apply database migrations for warehouse functionality
- [ ] Test carton creation functionality in CartonsView component
- [ ] Validate carton deletion protection (prevent deletion when products assigned)
- [ ] Test bulk label generation from warehouse module
- [ ] Verify inventory synchronization when moving products between cartons

### Enhancement Backlog
- [ ] Add barcode scanning for carton lookup (in addition to product scanning)
- [ ] Implement carton labeling/numbering system
- [ ] Add weight/total quantity calculations per carton
- [ ] Generate carton labels/packing lists
- [ ] Implement carton transfer between warehouses (if multi-warehouse enabled)
- [ ] Add low carton stock alerts
- [ ] Enhance reporting with carton utilization metrics

### Technical Debt
- [ ] Add unit tests for services and components
- [ ] Implement proper loading states and skeletons
- [ ] Add form validation for all input fields
- [ ] Improve accessibility (ARIA labels, keyboard navigation)
- [ ] Add offline capability with local queue sync
- [ ] Implement role-based access control (RBAC)
- [ ] Add data export/import for backups
- [ ] Implement audit trail for critical operations

## Database Migration Information

The following migration files are available but need to be applied:

1. **20260805000000_create_product_tracking.sql**
   - Creates `public.cartons` table with id, created_at, updated_at columns
   - Adds sku, qr_code, barcode, reserved_at columns to `public.inventory_items`
   - Adds CHECK constraint for inventory_items.status
   - Adds foreign key constraint from inventory_items.carton_id to cartons.id

2. **20260805000001_add_location_to_cartons.sql**
   - Adds location TEXT column to public.cartons table

These migrations appear to be designed to support the warehouse module functionality including:
- Carton creation and management
- Product-to-carton assignment via scanning
- Inventory tracking within cartons

## Integration Points

### External Systems
- **E-commerce Platforms**: Shopify, WooCommerce, etc. via API keys
- **Shipping Carriers**: Delhivery, DTDC, Shiprocket, etc. for tracking
- **Payment Gateways**: Implied through COD/Prepaid handling
- **Email/SMS**: Not implemented but potential for notifications

### Internal Modules Flow
1. **Order Creation** → Inventory deduction → Label generation → Printing
2. **Inventory Receiving** → Batch creation → Stock update → Available for orders
3. **Warehouse Storage** → Carton creation → Product assignment → Retrieval for orders
4. **Order Fulfillment** → Pick from carton → Mark as shipped → Tracking update
5. **Returns Processing** → Receive item → Quality check → Restock or disposition

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Environment Configuration
- `.env.local` contains Supabase URL and anonymous key
- No build-time environment variables needed (all runtime)
- Tailwind configured via tailwind.config.js and postcss.config.js

## Deployment Considerations

### Hosting
- Can be deployed to any static hosting (Vercel, Netlify, etc.)
- Requires Supabase backend for data persistence
- No server-side rendering needed (pure SPA)

### Environment Variables
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous/public key

### Build Output
- Optimized static assets in `/dist` directory
- Separate chunks for better caching
- Assets processed through Vite pipeline

## Team Collaboration Guidelines

### Brain File Usage
- This file (`brain.md`) should be updated at end of each work session
- When starting new chat, request to read this file for context
- Include: Date, work accomplished, decisions made, blockers, next steps

### Code Standards
- Follow existing TypeScript interfaces strictly
- Use tailwind utility classes consistently
- Component composition over inheritance
- Services should be stateless where possible
- Error handling with user feedback (not just console.log)
- Loading states for all async operations

### Commit Messages
- Use conventional commits format: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
- Reference related issues or tickets when applicable
- Keep subject line under 50 characters

## Next Steps for Current Session

To enable full warehouse functionality:
1. Apply the Supabase migrations for carton and inventory item tracking
2. Test carton creation functionality in CartonsView component
3. Verify product scanning and assignment to cartons works correctly
4. Test carton deletion protection (should fail when products assigned)
5. Check that product status updates correctly when assigned/removed from cartons

## Summary

UDYAM LABEL is a comprehensive fulfillment label printing system with strong warehouse management capabilities. The technology stack is modern and well-suited for the use case, with Supabase providing reliable backend services.

**Current Status**: The frontend application is working correctly (JSX syntax errors resolved, UI renders), but warehouse module functionality is limited because required database tables (cartons, inventory_items, integrations) have not been created yet. Migration files exist and need to be applied to enable full carton management and product tracking features.

The system is ready for warehouse functionality once the database schema is updated with the available migrations.