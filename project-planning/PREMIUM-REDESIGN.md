# Fabrication Intelligence visual refresh

11 October 2026

The supplied Terra & Timber reference inspired the oversized sans-serif headline, open white layout and wide photography. The user asked for an original logo in place of the FABINT wordmark and two complementary fonts.

## Starting point

Started from main at 795cd1d. Before release, integrated the newer main through ec11a5c, including the 79-product catalogue, Shopify pricing, finish filters, direct-delivery model, founding offer, support, documentation, legal pages and service logging. Those existing services and policy texts retain their current behaviour. The existing site used ivory, green, Michroma and Didact Gothic, a two-row navigation and text over a bathroom image.

## Design direction

White canvas, near-black text, forest-green actions. Manrope for expressive headings and DM Sans for reading text and controls. Original geometric mark made from three interlocking architectural frames, paired with the full company name. Square image edges and controls, subtle hover movement, no forced scrolling.

The hero reference uses a compact header, a single oversized heading, one clear shop action and a panoramic image. The shop reference uses a large title, search and sorting, category and finish filters and an open product grid. Cards expose existing prices and supplier information. The upstream SHOW_FI_RATING setting remains off. Featured order follows the upstream ready-to-buy ordering. Product photography fits inside the image frame so labels and product variants are not cropped out.

AI images remain labelled as concepts or catalogue renders. The new lifestyle image is inspiration, not a completed customer project or a photograph of a sold product. Fonts are self-hosted with their open-source licences.

## Scope

Homepage composition and collection discovery; shared navigation, logo, typography and footer; shop search, sorting and category state; product detail styling. Existing customer and payment services keep their current behaviour.

## Motion and accessibility

Short heading and photo entrances, scroll reveals, staggered product cards, subtle image hover and menu transitions. There is no scroll interception. Content remains usable without motion, and the footer control stores the visitor's choice for the current session. Device reduced-motion preferences take priority. Keyboard focus reveals content immediately. Native details elements retain functional menus and disclosures.

## Review notes

Reviewed desktop and phone layouts, including home, shop, product, About and sign-in. Search, sorting, reset and the mobile menu were exercised during implementation. The initial checkout, product and source-audit subset passed 17 checks before the newer main was integrated; that result does not represent a full regression run of the merged release. No purchases, external enquiry submissions or account changes were made. Existing tests tied to the old navigation and homepage structure have not been rewritten as part of this design change.
