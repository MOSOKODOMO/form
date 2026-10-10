# Ivory design update, 9 October 2026

DM Sans (Google Fonts) is used for body copy, navigation, buttons, product names and longer headings. Paragraphs use 17–18px and 1.6 line height. Selected short headings use Michroma Regular at weight 400; the logo uses the supplied artwork described below.

On 10 October 2026 the owner supplied `Michroma-Regular.ttf` and requested it for the logo and occasional short headings, replacing the previous Eurostile fallback plan. The original font is self-hosted at `dist/assets/fonts/Michroma-Regular.ttf`, with its SIL Open Font License at `dist/assets/fonts/Michroma-OFL.txt`. The font face is declared in `dist/editorial-michroma.css`.

## Logo artwork

On 10 October 2026 the owner supplied `fabint-wordmark-3-stacked-lockup.png` and requested it as the website logo. The original image is copied without alteration to `dist/assets/fabint-stacked-lockup.png` and used in header and footer brand links. `dist/brand-lockup.css` crops its outer whitespace in the layout and uses multiply blending to integrate its white background with the ivory page. The image is decorative inside each already-labelled home link. Michroma remains the font for selected short headings.

## Photography

The original inspiration photographs were retrieved on 9 October 2026 under the [Unsplash License](https://unsplash.com/license). They are retained as unused assets after the owner selected replacement concepts.

- `dist/assets/materials-home.jpg`: former hero image by [Clay Banks, cabin interior in Swan Lake](https://unsplash.com/photos/q6OZdkVVCPA), published 4 September 2025. Source: `https://images.unsplash.com/photo-1757023177496-131ded651c01`. No longer displayed.
- `dist/assets/materials-kitchen.jpg`: former kitchen inspiration image by [roam in color](https://unsplash.com/photos/zzMb7jacyBc), retained but no longer displayed. Replaced at the owner's request on 10 October 2026.

## AI bathroom hero

`dist/assets/bathroom-hero-concept.png` is the owner's supplied `ChatGPT Image 10 Oct 2026, 22_10_07.png`. It fills the opening hero behind the approved headline, “Cheaper products from makers we've verified.” The visible credit identifies it as an AI-generated bathroom concept. Native scrolling moves the copy upwards while the sticky image fades into warm ivory; reduced-motion and the site motion toggle provide a static alternative. `home-immersive.css` and `home-immersive.js` implement this homepage-only treatment.

## AI kitchen concept

`dist/assets/kitchen-concept-camera.png` is the owner's selected second kitchen concept, generated with the built-in image generation tool using their reference screenshots of checkerboard tiles, black cabinet pulls and a brushed-metal tap. The second edit requested more realistic camera lighting, texture and subtle imperfections while preserving the layout and product-inspired fixtures. It is displayed at its original 3:2 aspect ratio, with a visible AI-generated caption and descriptive alt text. It is not presented as a real completed project or an exact product photograph. Original generated file: `exec-f484c145-2cff-4b4c-bd2d-b36a8376a3ab.png`.

The product catalogue keeps its existing permission-based photo policy and placeholder cards.
