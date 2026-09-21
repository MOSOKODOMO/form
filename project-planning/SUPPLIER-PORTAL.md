# Supplier portal launch checklist

The portal is at `/supplier-portal.html`. It is private by design: an email must already exist in Supabase Auth and be assigned to a supplier record before it can receive a sign-in link.

## First deployment

1. Run `supabase/migrations/20260920012456_fi_supplier_portal.sql` in the linked FI Supabase project. The portal needs the six `fi_supplier_*` tables and the private `fi-supplier-assets` bucket before it will operate.
2. If the project uses explicit Data API table exposure, expose the new `public.fi_supplier_*` tables. The migration includes RLS and grants, but exposure is a separate Supabase setting.
3. In Supabase Auth URL configuration, add both production `https://fabricationintelligence.com/supplier-portal.html` and the local preview address used by the team, for example `http://127.0.0.1:4173/supplier-portal.html`, to the redirect allow-list.
4. Deploy `dist/` through the existing GitHub Pages workflow.

## Invite a supplier

1. Sign in to `/supplier-portal.html` using an FI team account.
2. Create the supplier record with the legal company name and the supplier contact's email. This creates the company profile and membership link.
3. In Supabase Dashboard → Authentication → Users, invite or create the same email address. Do not use the public portal to create accounts.
4. Give the supplier the portal URL. They request a one-time sign-in link, complete their profile, add products/files, and choose **Submit to FI**.
5. In the FI review queue, record the profile/product decision and feedback. Only an FI team member can mark a record approved.

## Boundaries of this release

- Supplier files are private, stored in `fi-supplier-assets`, and only accessible to the matched supplier or an FI team member.
- Supplier product/profile data is not public and is not connected to customer RFQs yet.
- The team review queue creates supplier records but does not send Auth invitations itself; invitation creation needs a trusted server or Supabase Dashboard access because it requires privileged Auth permissions.
