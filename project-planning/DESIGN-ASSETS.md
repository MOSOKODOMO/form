# Ivory design update, 9 October 2026

On 11 October 2026 the owner requested Michroma Regular for all website text, superseding the DM Sans pairing. The supplied self-hosted font now covers headings, body copy, navigation, buttons, forms and workspaces at weight 400, with synthetic bold disabled. Paragraphs retain 17–18px sizing and 1.6 line height. Navigation wraps as needed and hero headings are sized for Michroma's wider letterforms. The logo remains the supplied artwork described below.

On 10 October 2026 the owner supplied `Michroma-Regular.ttf` and requested it for the logo and occasional short headings, replacing the previous Eurostile fallback plan. The original font is self-hosted at `dist/assets/fonts/Michroma-Regular.ttf`, with its SIL Open Font License at `dist/assets/fonts/Michroma-OFL.txt`. The font face is declared in `dist/editorial-michroma.css`.

## Logo artwork

On 10 October 2026 the owner supplied `fabint-wordmark-3-stacked-lockup.png` and requested it as the website logo. The original image is copied without alteration to `dist/assets/fabint-stacked-lockup.png` and used in header and footer brand links. `dist/brand-lockup.css` crops its outer whitespace in the layout and uses multiply blending to integrate its white background with the ivory page. The image is decorative inside each already-labelled home link. Michroma remains the font for selected short headings.

## Photography

### Team portraits, 11 October 2026

The three newly supplied 1254 × 1254 PNGs are copied unchanged to `dist/assets/team/`, in the supplied order for the existing Prem, Lincy and Mos cards on both the homepage and About page:

- `ChatGPT Image 11 Oct 2026, 00_22_49.png` → `prem-20261011.png`
- `ChatGPT Image 11 Oct 2026, 00_22_02.png` → `lincy-20261011.png`
- `ChatGPT Image 11 Oct 2026, 00_23_06.png` → `mos-20261011.png`

Their square frames are preserved using `object-fit: contain`. Previous portrait assets remain available but are no longer displayed.

The original inspiration photographs were retrieved on 9 October 2026 under the [Unsplash License](https://unsplash.com/license). They are retained as unused assets after the owner selected replacement concepts.

- `dist/assets/materials-home.jpg`: former hero image by [Clay Banks, cabin interior in Swan Lake](https://unsplash.com/photos/q6OZdkVVCPA), published 4 September 2025. Source: `https://images.unsplash.com/photo-1757023177496-131ded651c01`. No longer displayed.
- `dist/assets/materials-kitchen.jpg`: former kitchen inspiration image by [roam in color](https://unsplash.com/photos/zzMb7jacyBc), retained but no longer displayed. Replaced at the owner's request on 10 October 2026.

## AI bathroom hero

`dist/assets/bathroom-hero-concept.png` is the owner's supplied `ChatGPT Image 10 Oct 2026, 22_10_07.png`. The visible credit identifies it as an AI-generated bathroom concept. The 10 October framing refinement fits the entire image below the desktop header, including the floor tiles, with a narrower ivory gradient behind the copy. The hero no longer reserves an additional 85% of its height for scrolling, bringing the categories directly after it. On mobile, the full 3:2 image appears above the copy without an overlay or fade. Desktop native scrolling fades the image into ivory; reduced-motion and the site motion toggle provide a static alternative. `home-immersive.css` and `home-immersive.js` implement this homepage-only treatment.

## AI kitchen concept

`dist/assets/kitchen-concept-camera.png` is the owner's selected second kitchen concept, generated with the built-in image generation tool using their reference screenshots of checkerboard tiles, black cabinet pulls and a brushed-metal tap. The second edit requested more realistic camera lighting, texture and subtle imperfections while preserving the layout and product-inspired fixtures. It is displayed at its original 3:2 aspect ratio, with a visible AI-generated caption and descriptive alt text. It is not presented as a real completed project or an exact product photograph. Original generated file: `exec-f484c145-2cff-4b4c-bd2d-b36a8376a3ab.png`.

The product catalogue keeps its existing permission-based photo policy and placeholder cards.
