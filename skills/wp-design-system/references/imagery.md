# Text over imagery

Measured while illustrating a client site whose design mockups put a
photograph behind the hero, behind every category card, and behind the closing
call to action.

## Contents

- [The rule: text is read over a veil, never over a photo](#the-rule-text-is-read-over-a-veil-never-over-a-photo)
- [The gradient's direction is decided by the text, not the picture](#the-gradients-direction-is-decided-by-the-text-not-the-picture)
- [Degrade to opaque, never to unreadable](#degrade-to-opaque-never-to-unreadable)
- [A background image's alt is empty](#a-background-images-alt-is-empty)
- [Never `full` on an image a client will replace](#never-full-on-an-image-a-client-will-replace)
- [Placeholder photography is a liability, so label it](#placeholder-photography-is-a-liability-so-label-it)
- [A component copied into a template will diverge](#a-component-copied-into-a-template-will-diverge)

## The rule: text is read over a veil, never over a photo

A headline placed directly on a photograph has **no contrast ratio** — it has a
different one per pixel, and it changes the moment someone swaps the image.
White-on-photo passes over the dark half of a picture and fails over the sky in
the same shot. There is nothing to test and nothing to promise.

Put an opaque-enough layer between them and the ratio becomes a property of the
design rather than of the photograph:

```html
<section class="hero hero--illustrated">
  <img class="hero__image" src="…" alt="">
  <span class="hero__veil" aria-hidden="true"></span>
  <div class="hero__inner">…</div>
</section>
```

```css
.hero--illustrated { position: relative; isolation: isolate; }

.hero__image {
	position: absolute; inset: 0;
	width: 100%; height: 100%;
	object-fit: cover;
	z-index: -2;
}

.hero__veil { position: absolute; inset: 0; z-index: -1; }
```

`isolation: isolate` on the section is what makes the negative `z-index` safe:
without it the image and veil escape behind the section's own background and
disappear on any ancestor that paints.

The contrast you then quote — navy at 88% against white text — is real,
reproducible, and survives the client replacing every photograph on the site.

## The gradient's direction is decided by the text, not the picture

A veil applied evenly wastes the image and flattens the composition. Make it
heaviest exactly where the words are, and let it open where they are not. That
direction is not a decorative choice; it is read off the layout.

| Layout | Text sits | Gradient runs |
|---|---|---|
| Hero, copy on the left | left third | left → right, opaque to transparent |
| Card, caption pinned to the bottom | bottom | bottom → top |
| Full-bleed banner, centred copy | centre | radial, or an even scrim |

```css
/* Hero: solid where the copy is, opening to show the photograph on the right. */
.hero__veil {
	background: linear-gradient(
		100deg,
		var(--wp--preset--color--navy) 30%,
		color-mix(in srgb, var(--wp--preset--color--navy) 86%, transparent) 55%,
		color-mix(in srgb, var(--wp--preset--color--navy) 45%, transparent) 100%
	);
}

/* Card: caption is anchored at the bottom, so the top of the image stays clear. */
.card__veil {
	background: linear-gradient(
		to top,
		var(--wp--preset--color--navy) 8%,
		color-mix(in srgb, var(--wp--preset--color--navy) 72%, transparent) 45%,
		color-mix(in srgb, var(--wp--preset--color--navy) 15%, transparent) 100%
	);
}
```

Note the stop *percentages* carry the design, not the colours: the card is fully
opaque only for its bottom 8%, which is enough for a two-line caption and leaves
the subject of the photograph visible.

## Degrade to opaque, never to unreadable

`color-mix()` is recent. The failure mode when it is not supported is not a
slightly different tint — the whole `background` declaration is dropped, the
veil becomes transparent, and white text lands on a bare photograph. That is the
one outcome the veil existed to prevent.

Always pair it with a fallback that errs toward *less* image, never less
contrast:

```css
@supports not (background: color-mix(in srgb, red 50%, transparent)) {
	.hero__veil { background: var(--wp--preset--color--navy); opacity: 0.88; }
}
```

The general form of this rule: **when a progressive enhancement fails, the
degraded state must still meet the contrast floor.** An enhancement that can
drop below it is not an enhancement.

## A background image's alt is empty

A hero background and a card's backdrop are decorative *by construction* — the
headline immediately after them carries the meaning. Giving them descriptive
alt text makes a screen reader announce the image, then the headline that says
the same thing.

```php
// Decorative: the heading right below carries the meaning.
echo wp_get_attachment_image( $id, 'mytheme-hero', false, array(
	'alt'           => '',
	'fetchpriority' => 'high',
) );
```

Two cases worth separating:

- **Inside a link that already has a label** — a category card whose image sits
  in the same `<a>` as the category name. `alt=""`, or the link is announced
  twice.
- **A content image that happens to be a background** — a case study's own
  photograph used as a section backdrop. That one is not decorative; describe
  it.

`wp_get_attachment_image()` falls back to the attachment's stored alt when you
pass nothing, so the empty string has to be explicit. Omitting the argument is
not the same as `alt=""`.

## Never `full` on an image a client will replace

`'full'` is the original upload. It is fine while the only images on the site
are the ones you placed; it stops being fine the first time a client drags a
4000-pixel photo from a phone into the hero, at which point every visit serves
it whole.

Register the size the design actually needs, and ask for it by name:

```php
add_image_size( 'mytheme-hero', 1920, 900, true );   // cropped
add_image_size( 'mytheme-card', 720, 480, true );
```

WordPress never upscales, so a source smaller than the registered size resolves
to the original — the named size costs nothing when the image is already small
and caps the damage when it is not.

## Placeholder photography is a liability, so label it

Stock imagery makes a site look finished, which is exactly the problem: it
removes the pressure to replace it, and a case study illustrated by a stock
photograph quietly undercuts the claim it is making. A reader who recognises the
photo has been given a reason to doubt the project.

If a build ships with stock images, ship a note with them that says what they
are, where they came from, and that replacing them is a launch task — not a
credits file written for the licence, but a handover note written for whoever
inherits the site. Licences like Pexels' require no attribution at all; the
reason to record the source anyway is that an image whose origin nobody
remembers cannot be replaced cleanly when someone finally asks.

Keep the swap to one step. Featured images and term meta are replaceable from
the editor; a photograph hard-coded into a template or a CSS `background-image`
is not, and it is the one that will still be there at launch.

## A component copied into a template will diverge

A front-page template held its own copy of a card grid's markup — the same
list, the same class names, written out a second time because it was three
elements and the template needed them inline. Both rendered identically, so
nothing looked wrong.

Then the component gained a background image. The block was updated; the
template's copy was not, because nothing connects them. The result was a grid
illustrated on one page and flat on the home page, from one commit, with no
error anywhere.

Render the component instead of restating it:

```php
// One implementation, one place to fix when the design changes.
echo do_blocks( '<!-- wp:mytheme/card-grid {"columns":4} /-->' );
```

This matters more for design-system work than for most code, because the failure
is silent *and* visual: the two copies do not disagree until a design change
lands on one of them, and the person who made that change has no reason to look
at the other. Any component whose markup appears twice will eventually render
two different designs.
