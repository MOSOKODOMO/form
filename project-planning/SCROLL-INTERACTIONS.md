# Site-wide scroll interactions

Updated 24 September 2026.

## Experience

- `dist/site-motion.js` and `dist/site-motion.css` enhance all 14 full HTML pages. The legacy request redirect remains a redirect.
- Editorial pages use a reading-progress line, a desktop section picker with next/top links, one-time section/card reveals and small glass-card hover responses.
- The homepage product image has subtle desktop depth movement. The existing glass assembly keeps its own isolated scroll sequence.
- The order journey highlights steps and connector lines as they enter the reading area. This is reading progress, not live order status.
- Functional pages (request, login, account, manufacturer portal, contact and feedback) do not reveal, translate or hide form content. Their motion controls stay in normal document flow.

## Accessibility and fallbacks

- Native scrolling is preserved; there is no wheel/touch interception, scroll locking or mandatory snapping.
- Only initially offscreen editorial elements receive pending reveal styles. Above-the-fold content is visible immediately; each reveal runs once.
- Keyboard focus and direct section links reveal the relevant content immediately. Content is never marked `aria-hidden` to create an animation.
- OS reduced-motion preferences take priority. The visible Motion button also disables the existing glass assembly and smooth anchor scrolling. The manual preference persists in session storage; storage failure does not prevent use.
- On narrow or short screens, controls move below the footer, chapter controls are hidden and decorative depth movement stops. The window assembly uses its existing static mobile layout.
- Without JavaScript, all content and normal navigation remain readable. Without IntersectionObserver, reveal hiding is not applied. Print styles show all content without floating controls.
- Prices, specifications, quote qualifications, biographies and form/account logic are unchanged. No analytics or new dependencies are introduced.

## Verification

Run `node --test tests/*.test.cjs`.

Runtime tests cover bounded progress, offscreen-only reveals, initial body focus, keyboard/deep links, section selection, storage and observer failures, manual and OS preferences, restored pages, functional exclusions and the glass assembly's shared toggle.

Browser QA at 1280 × 720 and 390 × 844 checks native scrolling, glass reveals, section navigation/focus, journey highlights, preference persistence, mobile overflow and unobstructed request fields. OS preference changes are covered by runtime tests and CSS inspection; browser QA does not change the user's device setting.
