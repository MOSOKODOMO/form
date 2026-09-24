# Glass-first website update — 24 September 2026

## Image

- Generated using the built-in image generation tool; no API/CLI fallback.
- Website asset: `dist/assets/window-low-e-marketing.png` (1536 × 1024).
- Concept illustration, not an exact supplier product, construction drawing or performance certification.
- A code-native schematic assembles with scroll and crossfades to the finished generated image; mobile, short viewports, reduced motion and no-JavaScript use a readable static layout.

### Final image prompt

```text
Use case: product-mockup
Asset type: premium marketing product photograph for FABINT's dark olive green website, used as the finished reveal of a scroll-driven glass assembly feature.
Primary request: showcase quality-looking low-E double glazing in a modern graphite aluminium double casement window; affordability and clarity rather than luxury ornament. One complete square window assembly, two side-by-side equal closed glazed sashes with slim central mullion, small realistic handles and subtle hardware; no external branding. The glass is the visual hero: luminous, perfectly clean neutral-clear panes with subtle sage reflections and realistic double glazing edge depth, not opaque or mirror-like. Outer dimensions look square, 1200 by1200 proportional.
Scene/backdrop: seamless very dark olive studio backdrop close to #252b23, gentle grounding shadow, no room, no scenery, no extra props.
Style/medium: photorealistic premium industrial product rendering, crisp realistic powder-coated graphite metal and polished glass, restrained modern technology campaign aesthetic.
Composition/framing: landscape 1536x1024, whole window centered with generous safe margins, nearly front-facing with a subtle three-quarter perspective showing frame thickness, entire object visible, glass occupying most of product area. Controlled studio rim lighting, off-white softbox reflections with a faint lime accent, natural contrast, no neon glow.
Constraints: finished fully assembled window, not exploded; exactly two glass sashes; no text, dimensions, labels, arrows, certification marks, logos, watermark, people or hands. Conceptual marketing image only; not imitating any supplier's specific product or claiming certification.
```

## Current homepage comparison — window-first refresh

The homepage now leads with “Creating more affordable homes for Australians,” starting with windows and glass. Seven glass-type summaries link to the full guide. The scroll assembly remains an educational 6 / 12 / 6 concept, explicitly separate from the single-glazed sliding windows in the current price references.

The requested Thai-versus-local comparison uses two public product listings, not a confirmed FABINT selling price or a like-for-like delivered saving. The Thai source is not named in the card heading; a neutrally labelled primary-source link remains for transparency. No supplier relationship, export availability, Australian compliance or equal quality is implied.

| Evidence checked 24 September 2026 | Thai product reference | Australian retail reference |
| --- | --- | --- |
| Source | [Window Asia complete sliding window](https://windowasia.com/en/product/aluminum-sliding-window-white-s-s-120x110-en/) | [Stegbar Sliding Window 2.0, variant 51662968160487](https://www.stegbar.com.au/products/sliding-window-2-0?variant=51662968160487) |
| Published price | THB 3,690, approximately A$156.55 | A$742.50 sale, SKU W000501 |
| Dimensions, W × H | 1200 × 1100 mm | 1210 × 1200 mm |
| Glass | 5 mm green-tinted single pane | Clear single glazing; thickness not published |
| Frame / finish | Aluminium; title says white but detail table conflicts, so confirm finish | Aluminium, Pearl White Gloss |
| Australian cost scope | Australian GST, import/clearance and door delivery unconfirmed, not priced | Product page includes GST, reveals and eligible-area delivery |

- Thai conversion: 3,690 / 23.57 = A$156.55, rounded to cents. [RBA reference rate, 23 September 2026](https://www.rba.gov.au/statistics/frequency/exchange-rates.html). Excludes exchange spread and payment fees; not a settlement-rate offer.
- Stegbar exact variant independently checked against [public product JSON](https://www.stegbar.com.au/products/sliding-window-2-0.js), `price: 74250`, `compare_at_price: 82500`. The generic product-page parser can show a different default variant; retain the exact variant ID.
- [Stegbar delivery terms](https://www.stegbar.com.au/pages/shop-online-support-centre): eligible Australian locations only; front door at ground level, not stairs/lifts/steps. Installation is excluded.
- Both cards use matching specification/cost labels. Missing costs are **unknown, not zero**. No invented tax/freight totals, percentage savings or equivalence claims.
- FABINT fee remains 10% of delivered cost when an order proceeds, waived for first 10 projects. The Thai delivered base is unknown, so neither a final fee nor FABINT retail price is calculated.
- A valid delivered comparison still needs matching specifications, Australian suitability evidence, warranty and written totals to the same delivery address.

### Verification of the refresh

- All 35 Node tests pass, including homepage mission, seven glass cards, identical comparison field labels, unresolved Thai cost scope and the separation of concept imagery from priced products.
- Browser checked at desktop, 960 px tablet and 390 / 320 px phone widths; no horizontal content overflow. Two-card prices and rows align on desktop/tablet and stack on phones.
- Product imagery loads; no browser warning/error logs observed in the local preview. Existing account/database behaviour is unchanged.

## Earlier comparison evidence — superseded on homepage

Retained for research history. The following three-route comparison is no longer the current homepage presentation.

- Common requested brief: complete 1200 × 1200 mm double-casement window, 6 mm Low-E / 12 mm cavity / 6 mm toughened glazing, thermally broken aluminium, Monument finish, Melbourne destination. This is a comparison brief, not confirmation that every listed item is identical.
- Display order: Thailand (SMG Glass), China (Superhouse), then local Australia (Sydney uPVC.com.au).
- [SMG price guide](https://www.smg-con.co.th/news_detail.php?id=64): indicative Low-E CS120 glass range of THB 5,000–9,500/m², approximately A$212–403/m² at 23.57 THB per AUD (RBA, 23 September 2026), rounded to whole AUD. Not a framed-window or Australian delivered quote; exact configuration, toughening, quantity and export scope require quotation. [Glazing options](https://www.smg-con.co.th/product-detail.php?id=6) separately list 6 / 12 air / 6 Low-E; the guide is not verified as the exact requested unit.
- Existing Superhouse quote: USD 800 dated 21 September 2026. The user clarified door-to-door shipping is included; do not add freight again. This clarification supersedes the earlier website freight caveat. GST/import charges remain unconfirmed; destination and tax terms should be retained in the written supplier quote.
- [RBA rate](https://www.rba.gov.au/statistics/frequency/exchange-rates.html): 23 September 2026, 0.7102 USD per AUD; 800 / 0.7102 = A$1,126.44 rounded. Indicative conversion only, not a bank settlement rate.
- [XN casement specification](https://www.xnwindows.com.au/range/casement-window): retained as a research reference, no longer one of the three homepage cards after the requested country reordering.
- [Sydney casement variant](https://www.upvc.com.au/products/aluminium-thermally-broken-australian-made?variant=39812523753581): rate verified in public product data; A$900/m² × 1.44 m² = A$1,296 including GST, supply benchmark only. Colour, sash configuration and delivery still require a project quote.
- [Domestic delivery information](https://www.upvc.com.au/products/delivery): do not apply a Sydney-local delivery rate to Melbourne.
- No cheapest-supplier, certified-equivalence or savings claim; published online specifications checked 24 September 2026.
