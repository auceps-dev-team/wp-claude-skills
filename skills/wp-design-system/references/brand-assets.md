# Integrating brand assets

Logos and fonts arrive as files someone else made, usually for print or for a slide deck. Treating them as web-ready is how a header ends up costing 750 KB and a footer shows a white rectangle. This is the intake procedure.

## Contents

- [Audit the logo before using it](#audit-the-logo-before-using-it)
- [The variants a site actually needs](#the-variants-a-site-actually-needs)
- [Generating them](#generating-them)
- [Wiring the logo into a theme](#wiring-the-logo-into-a-theme)
- [Fonts: the intake decision](#fonts-the-intake-decision)
- [Shipping a self-hosted face](#shipping-a-self-hosted-face)
- [What to send back to the client](#what-to-send-back-to-the-client)

## Audit the logo before using it

Four questions, in this order. Answer them from the file, not from what the file is called.

**Is the SVG actually vector?** A `.svg` extension proves nothing — design tools happily export a bitmap wrapped in an SVG container:

```bash
grep -c "data:image" logo.svg          # >0 means an embedded raster
grep -o "<path" logo.svg | wc -l       # 0-1 paths on a wordmark is a red flag
grep -o "<image" logo.svg | wc -l
```

A real logo SVG has dozens of `<path>` elements and no `data:image`. One `<image>` plus one `<path>` used as a clip means you have a PNG in a costume: it will not scale, and it weighs more than the PNG would have on its own.

**Does it have transparency?** Read the PNG header rather than trusting the preview, where a white background is invisible against a white page:

```bash
node -e 'const b=require("fs").readFileSync("logo.png");
  console.log(b.readUInt32BE(16)+"x"+b.readUInt32BE(20),
  [4,6].includes(b[25])?"alpha":"OPAQUE");'
```

Byte 25 is the PNG colour type: 4 and 6 carry alpha, 0 and 2 do not. An opaque logo cannot sit on a dark section, and dark footers are extremely common.

**Where is the artwork inside the canvas?** Brand files are often square with the mark floating in the middle. Scan for the content bounding box before deciding anything about dimensions — a 2000×2000 file whose artwork is 1890×552 is a wide horizontal lockup, and that changes every layout assumption you were about to make.

**What does it weigh?** Anything over ~30 KB for a header mark is a Largest Contentful Paint problem, because the header logo is above the fold on every page of the site.

## The variants a site actually needs

| Variant | Used for | Requirement |
|---|---|---|
| Default | Header, light sections | Transparent, cropped to artwork, ~2× display size |
| Inverse | Dark footers, hero sections | Light artwork, transparent |
| Small | Mobile header, favicon source | Same mark, separately optimised |

The inverse variant is the one that gets forgotten, and its absence is only discovered when someone looks at the footer. Generating it is part of integrating a logo, not a later fix.

## Generating them

GD ships with PHP, so no toolchain is required. The steps that matter are cropping to the content box, keying the background out to alpha, and resampling once rather than repeatedly.

```php
$src  = imagecreatefrompng( 'brand/logo.png' );
$crop = imagecrop( $src, array( 'x' => 10, 'y' => 640, 'width' => 1920, 'height' => 590 ) );

$w   = imagesx( $crop );
$h   = imagesy( $crop );
$tmp = imagecreatetruecolor( $w, $h );
imagealphablending( $tmp, false );
imagesavealpha( $tmp, true );

for ( $y = 0; $y < $h; $y++ ) {
	for ( $x = 0; $x < $w; $x++ ) {
		$c = imagecolorat( $crop, $x, $y );
		$r = ( $c >> 16 ) & 0xFF;
		$g = ( $c >> 8 ) & 0xFF;
		$b = $c & 0xFF;

		// Luminance drives both the alpha key and the inversion mask, which
		// keeps antialiased edges smooth instead of producing a hard halo.
		$lum = ( 0.2126 * $r + 0.7152 * $g + 0.0722 * $b ) / 255;

		if ( $lum > 0.96 ) {
			imagesetpixel( $tmp, $x, $y, imagecolorallocatealpha( $tmp, 255, 255, 255, 127 ) );
			continue;
		}

		$alpha = (int) round( 127 * $lum * 0.6 );
		imagesetpixel( $tmp, $x, $y, imagecolorallocatealpha( $tmp, $r, $g, $b, $alpha ) );
	}
}
```

For the inverse variant, replace dark pixels with the light colour and **keep the accent colour unchanged** — an inverted logo that also inverts the brand accent stops being the brand.

Measured on one real intake: a 748 KB square opaque PNG became a 61 KB transparent 540×166 default plus a 24 KB inverse. A 92% reduction with no visible change at display size.

## Wiring the logo into a theme

```php
add_theme_support( 'custom-logo', array(
	'height'      => 48,
	'width'       => 180,
	'flex-width'  => true,
	'flex-height' => true,
) );
```

Let the Customizer logo win, and fall back to the bundled file:

```php
function mytheme_branding( $variant = 'default' ) {
	if ( 'default' === $variant && has_custom_logo() ) {
		the_custom_logo();   // emits srcset and the home link for you
		return;
	}
	// ... bundled variant, then the site title as a last resort
}
```

Shipping a bundled fallback matters: a fresh install branded with the site title in the browser default font looks broken during the client demo. But the Customizer must always take precedence, because the client has to be able to change their own mark without a developer.

Three details that are always wrong when they are wrong:

- **Never lazy-load the header logo.** It is the LCP element on most pages. Use `fetchpriority="high"` on the front page; below-the-fold instances can lazy-load.
- **Always set `width` and `height`.** Without them the header reflows as the image arrives — a Cumulative Layout Shift you inflicted on yourself.
- **Constrain `max-height` in CSS.** A bundled 540 px logo will otherwise impose its natural size and blow the header apart.

Alt text describes the destination, not the picture. The logo is a link home, so "Company name, back to home" beats "Company logo".

## Fonts: the intake decision

Ask one question first: **does this project actually need a custom face?** A system stack costs zero bytes, paints immediately, and never produces a flash of invisible text. Propose it before assuming a typeface is required — it is the right answer more often than the brief implies.

If a custom face is genuinely needed, it must be **self-hosted**. Loading from `fonts.googleapis.com` sends every visitor's IP to a third party — a real GDPR exposure that has produced fines in the EU — and adds a blocking third-party connection on the critical path.

## Shipping a self-hosted face

Structure the theme so the font is a drop-in rather than a code change, and so its absence degrades to the system stack instead of 404ing:

```php
function mytheme_font_face() {
	$face = apply_filters( 'mytheme_font_face', array(
		'file'   => 'assets/fonts/inter-variable.woff2',
		'family' => 'Inter',
		'weight' => '400 700',
	) );

	// A @font-face pointing at a file that is not there produces a 404 on every
	// page load and a font that never arrives.
	if ( ! is_readable( get_template_directory() . '/' . $face['file'] ) ) {
		return null;
	}

	return $face;
}
```

Then emit the rule on `wp_enqueue_scripts` **and** `enqueue_block_assets`, so the editor renders in the same face as the published page.

Rules worth holding to:

- **One variable file** replaces four to six static weights.
- **`font-display: swap`**, always. The alternative is invisible text.
- **Preload exactly one face** — the one used above the fold. Preloading every weight competes with the resources that actually block rendering.
- **Do not declare `fontFace` in `theme.json` for a file you have not shipped.** That declaration is not conditional; it 404s on every request.

The last point is easy to get wrong when scaffolding: writing the `fontFace` block and the preload before the font file exists produces a theme that looks finished and quietly fails. Either ship the file, or ship neither.

## What to send back to the client

When the supplied assets cannot do the job, say so with the measurement rather than silently working around it. A useful note names the defect, the consequence, and what to ask the designer for:

> The supplied SVG is a 905 KB PNG embedded in an SVG wrapper with an opaque background — no vector paths, so it cannot scale and cannot sit on the dark footer. We generated web variants from the PNG to unblock the build. For the final site, ask the designer for a true vector SVG with live paths, a transparent background, and a horizontal lockup alongside the square mark.

Unblocking the build **and** flagging the source problem is the right combination. Doing only the first hides a defect that resurfaces at every future touchpoint — business cards, signage, the mobile app.
