# How to Apply Database Migrations for UDYAM LABEL Warehouse Functionality

## Issue Identified
The warehouse module (CartonsView and ProductsView components) requires database tables that don't currently exist in the Supabase database:
- `public.cartons` - for carton storage and location tracking
- `public.inventory_items` - needs additional columns for product tracking (sku, qr_code, barcode, reserved_at)
- `public.integrations` - for storing platform integration configurations

Migration files exist but need to be applied:
- `supabase/migrations/20260805000000_create_product_tracking.sql`
- `supabase/migrations/20260805000001_add_location_to_cartons.sql`

## Recommended Approaches

### Approach 1: Use Supabase CLI (Recommended)
If you have access to the Supabase CLI:

1. Install Supabase CLI (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. Login to your Supabase account:
   ```bash
   supabase login
   ```

3. Link to your project:
   ```bash
   supabase link --project-ref gmbskdhdewacvsijqgxi
   ```

4. Apply migrations:
   ```bash
   supabase db push
   ```
   OR run specific migration files:
   ```bash
   supabase db reset --schema public --version 20260805000000
   supabase db reset --schema public --version 20260805000001
   ```

### Approach 2: Use Supabase Dashboard
1. Go to https://app.supabase.io/project/gmbskdhdewacvsijqgxi
2. Navigate to the SQL Editor
3. Create a new query
4. Copy and paste the contents of each migration file:
   - First: `supabase/migrations/20260805000000_create_product_tracking.sql`
   - Second: `supabase/migrations/20260805000001_add_location_to_cartons.sql`
5. Run each query

### Approach 3: Direct SQL Execution (For Development Only)
As a last resort for development environments, you could execute the SQL directly using the Supabase JS client, but this is not recommended for production migrations.

## Verification After Migration
After applying migrations, verify functionality by:

1. Testing carton creation in CartonsView component:
   - Navigate to Warehouse → Cartons
   - Enter a location and click "Create Carton"
   - Verify the carton appears in the list

2. Testing product assignment:
   - Select a carton
   - Click "Scan Product to Add"
   - Complete the scanning workflow
   - Verify product appears in the carton's product list

3. Testing carton deletion protection:
   - Try to delete a carton with products assigned
   - Should show confirmation and fail gracefully
   - Delete a carton without products
   - Should succeed

## Expected Results
Once migrations are applied:
- CartonsView component will be able to create, read, update, and delete cartons
- ProductsView component will be able to scan and assign products to cartons
- Inventory tracking will work correctly (products show as "In Stock" when in cartons)
- All warehouse module functionality will be operational

## Troubleshooting
If you encounter issues after migration:
1. Check browser console for any error messages
2. Verify that the Supabase connection is still working (orders table accessible)
3. Ensure the `.env.local` file contains correct Supabase credentials
4. Try a hard refresh (Ctrl+Shift+R) to clear any cached Vite modules