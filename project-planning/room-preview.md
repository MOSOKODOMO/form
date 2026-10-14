# Room preview

`room.html` lets a visitor put a product on a photo of their own room, in the browser. The photo is drawn
on a canvas on their device. Nothing is uploaded, stored or sent, and a test checks that the script makes no
request other than for the product list.

## Add a product to the preview

1. The product must already be in the shop (`dist/data/products.json`) with its studio render.
2. Run `py tools/make-cutouts.py <handle>`. It cuts the product out of its own render (U2-Net, Apache-2.0),
   writes `dist/assets/products/cutouts/<handle>.webp` and updates `dist/data/room-products.json`.
3. Look at the cut-out on a dark and a light background before publishing. Edges should be clean.

Without arguments, the tool rebuilds the built-in list of eight products.

## Add before and after rooms to the homepage

The slider on the homepage stays hidden until `dist/data/room-pairs.json` lists pairs. Put the two images in
`dist/assets/rooms/` (WebP or JPEG, about 1600 px wide, under 300 KB each), then add an entry:

```json
{
  "id": "kitchen",
  "title": "Kitchen",
  "before": "assets/rooms/kitchen-before.webp",
  "after": "assets/rooms/kitchen-after.webp",
  "alt_before": "AI concept image of a kitchen with plain cabinet doors",
  "alt_after": "AI concept image of the same kitchen with brass handles"
}
```

- Paths must be files on this site under `assets/`. Outside links are ignored.
- The slider labels every pair "AI concept image, not a photo of a real room". Only list images that are.
- Run `node --test tests/room-preview.test.cjs` after editing.
