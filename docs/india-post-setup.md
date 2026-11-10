# India Post delivery check: one-time setup

The website can ask India Post which shipped parcels were delivered. The check runs on the server
(Supabase Edge Function `india-post-sync`), so your India Post login is never inside the website.

## What it does
- Looks at every order that is **Shipped**, courier **India Post**, with a tracking number.
- Asks India Post (Tracking → Bulk Tracking Lookup) for each parcel, 50 at a time.
- Marks parcels India Post reports as delivered **Delivered** (and the delivery day), and returned ones **Returned**.
- Never touches orders that are not Shipped. It does not create or delete anything.

It also needs the tracking numbers to exist first. Use **Tracking and COD → Import India Post bookings**
(or type the numbers) for the orders that have none.

## Easiest way: run one script

In the Terminal, from the project folder:

```bash
bash scripts/setup-india-post.sh
```

It asks for your India Post username and password (hidden), signs in to Supabase, stores the login on the server, and installs the check. The steps below are the same thing done by hand.

## Set up by hand (once)

1. Store your India Post login on the server. Type these in your own terminal, with your real values.
   Do not paste them into any chat:

   ```bash
   supabase secrets set INDIAPOST_USERNAME='your-username'
   supabase secrets set INDIAPOST_PASSWORD='your-password'
   ```

2. Choose the server. The docs examples use the **sandbox** (test data only). For real parcels you need
   **production** access from India Post. When you have it, also set the production address that the portal gives you:

   ```bash
   supabase secrets set INDIAPOST_BASE_URL='https://<production address from the portal>/beextcustomer/v1'
   ```

   If you do not set it, the sandbox address `https://test.cept.gov.in/beextcustomer/v1` is used.

3. Deploy the function:

   ```bash
   supabase functions deploy india-post-sync
   ```

## Use it
- Press **Check delivery now** on the Tracking and COD page.
- To run it by itself every day, add a schedule in the Supabase dashboard (Integrations → Cron) that sends an
  HTTP POST to `https://<project>.supabase.co/functions/v1/india-post-sync` with the body `{"apply": true}`.

## Safe test first
Call the function with `{"apply": false}` (the default). It only reports what *would* change.

## If it says "login was refused"
Check the stored username and password, and that they belong to the same server (sandbox or production).
