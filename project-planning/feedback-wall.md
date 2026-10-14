# Feedback wall

The panel on the homepage and on product pages sends short comments to the team inbox, the same one the
one-minute feedback form uses (FormSubmit, fabricationintelligence@gmail.com). It shows only comments a
person has approved. Nothing on it is written by us.

## How a comment reaches the site

1. A visitor sends a comment. The email subject says where it came from, for example
   `FI site feedback (product mugu-brass-marble-t-bar): Builder · OK to show`. "OK to show" appears only when
   they ticked the box.
2. Check it. Keep their words as they wrote them. Fix a typo only with their say so, and never add praise.
3. Get permission in writing if it isn't clear. Keep a screenshot or the email.
4. Add it to `dist/data/testimonials.json`:

```json
{
  "quote": "Their own words, 400 characters at most.",
  "name": "First name only",
  "context": "Their role, and the suburb or city if they said it",
  "permission": true,
  "handle": "optional-product-handle"
}
```

- With `handle`, the comment shows on that product's page. Without it, on the homepage.
- An entry without `"permission": true`, or without a quote, name and context, is ignored.
- Never write comments for people. Use `review-preview-samples.json` for clearly labelled fictional examples only.

Run `node --test tests/feedback-panel.test.cjs` after editing the file.
