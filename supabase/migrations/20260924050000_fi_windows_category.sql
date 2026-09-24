-- Allow "windows" (Windows & glazing) as a quote-request category.
-- Until this runs, the request form files windows requests under "other"
-- and writes "Category: Windows & glazing" into the notes.
alter table public.fi_quote_requests drop constraint if exists fi_quote_requests_category_check;
alter table public.fi_quote_requests add constraint fi_quote_requests_category_check
  check (category in ('windows', 'stairs', 'facade', 'metalwork', 'precast', 'joinery', 'other'));
