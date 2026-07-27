---
applyTo: "src/assets/animals/*.svg"
---

# Animal SVG rules

Each animal SVG uses the shared art box:

- `viewBox="0 0 240 240"`
- exactly one closed `<path id="silhouette" d="...">`
- a `<g id="detail">` for eyes, markings, ears, spots, and similar detail

The same `#silhouette` path draws both the hole and the draggable piece. Do not
split the outline into separate piece and hole drawings.

Keep `#detail` inside `#silhouette` unless the overhang is intentional. Intent is
marked with `data-overhang="..."`, and all tagged overhang together must stay
within the 3% area budget enforced by `npm run art:check`.

Before calling art finished:

- run `npm run art:check`;
- run `npm run art -- <name>` and actually look at the large render;
- use `npm run art` if the contact sheet helps compare silhouettes.

A new animal must be distinct in outline from duck, turtle, giraffe, elephant,
butterfly, and rabbit. Toddlers match the outline before the detail.
