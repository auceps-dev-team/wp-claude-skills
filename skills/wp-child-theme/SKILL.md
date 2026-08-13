---
name: wp-child-theme
description: Create and work with WordPress child themes — correct stylesheet enqueueing, template and function overriding, pluggable functions, and when a child theme is the wrong tool. Use this whenever the user wants to customize a theme they did not write, safely modify a purchased or third-party theme, keep changes through theme updates, or asks why their child theme overrides are not taking effect.
---

# Child themes

A child theme lets you change a parent theme without editing it, so parent updates do not erase your work. That is the whole value proposition, and it decides when to use one: **if the parent will ever be updated, customization goes in a child.** Commercial themes ship updaters; assume they will be updated.

## The three files

```
mytheme-child/
├── style.css        # header with Template:
├── functions.php    # enqueue parent styles, add customizations
└── screenshot.png   # 1200×900
```

`style.css` — `Template:` must match the parent's **directory name** exactly, case-sensitive. This is the single most common setup error; a mismatch makes WordPress refuse to activate the child.

```css
/*
Theme Name: My Theme Child
Template: mytheme
Version: 1.0.0
Text Domain: mytheme-child
*/
```

Do not use `@import` to pull in the parent stylesheet. It serializes downloads — the browser cannot start fetching the parent CSS until it has parsed the child's — and it bypasses the dependency system.

## Enqueue correctly

The right approach depends on how the parent loads its own CSS, which is why copy-pasted snippets so often fail.

**First, check whether the parent already enqueues the child stylesheet for you.** Commercial themes frequently do — they detect an active child, load its `style.css` with the correct dependency, and sometimes pick up extra files like `responsive.css` by `file_exists()`. Adding the textbook snippet on top of that loads the same file twice, and the duplicate usually lands at the wrong priority:

```bash
rg -n "get_stylesheet_uri|get_stylesheet_directory_uri|is_child_theme" --glob '*.php'
```

If a parent function like `<theme>_wp_styles_child()` already handles it, write no enqueue at all. Note the **priority** it uses too: if the child stylesheet loads at 1500 and the parent's responsive rules at 2000, your media queries lose — and the fix is a separate file the parent loads later, not `!important`.

**If the parent enqueues its stylesheet** (the normal case), declare a dependency so ordering is guaranteed:

```php
<?php
add_action( 'wp_enqueue_scripts', 'mytheme_child_styles', 20 );
function mytheme_child_styles() {
    wp_enqueue_style(
        'mytheme-child',
        get_stylesheet_directory_uri() . '/style.css',
        array( 'mytheme' ),                                    // the parent's handle
        wp_get_theme()->get( 'Version' )
    );
}
```

Find the parent's real handle first — guessing produces a silent no-op:

```bash
rg -n "wp_enqueue_style\(" --glob '*.php' | head -20
```

**If the parent does not enqueue** (relies on WordPress loading `style.css` implicitly):

```php
add_action( 'wp_enqueue_scripts', 'mytheme_child_styles' );
function mytheme_child_styles() {
    wp_enqueue_style( 'mytheme-parent', get_template_directory_uri() . '/style.css', array(), MYTHEME_VERSION );
    wp_enqueue_style( 'mytheme-child', get_stylesheet_uri(), array( 'mytheme-parent' ), wp_get_theme()->get( 'Version' ) );
}
```

Note the version argument: `wp_get_theme()->get( 'Version' )` returns the *child's* version, so bumping the child header busts the cache for your changes.

## The path functions

Getting these wrong is the second most common child-theme bug, and it fails silently:

| Function | Returns | Use for |
|---|---|---|
| `get_template_directory()` | **parent** path | Loading parent PHP files |
| `get_template_directory_uri()` | **parent** URL | Parent assets |
| `get_stylesheet_directory()` | **child** path (parent if no child) | Your own PHP files |
| `get_stylesheet_directory_uri()` | **child** URL | Your own assets |
| `get_stylesheet_uri()` | active `style.css` URL | The main stylesheet |

Mnemonic: *template* = parent, *stylesheet* = active theme. A parent theme that hard-codes `get_template_directory_uri()` for everything works fine standalone and silently ignores the child's replacement assets.

## What overrides and what does not

### Templates — full override

Copy a template from the parent into the same relative path in the child; the child's copy wins. `get_template_part()` and the template hierarchy both check the child first.

```
mytheme/template-parts/content.php   →   mytheme-child/template-parts/content.php
```

This is a **replacement**, not a merge — you now own that file, including any bug fixes the parent ships later. Copy the minimum: overriding `single.php` to change one line means re-syncing it on every parent release. Prefer a filter if the parent provides one.

### functions.php — additive, and it loads FIRST

The child's `functions.php` does not replace the parent's. Both run, child first. That ordering is what makes two techniques work and one fail.

**Pluggable functions — works.** If the parent wraps a function, the child can define it first and win:

```php
// Parent
if ( ! function_exists( 'mytheme_posted_on' ) ) {
    function mytheme_posted_on() { /* ... */ }
}

// Child — declared earlier, so the parent's guard skips its own version
function mytheme_posted_on() { /* your version */ }
```

**Unwrapped functions — impossible.** If the parent declares `function mytheme_posted_on()` with no guard, redeclaring it is a fatal error. Your only options are a filter, if one exists, or overriding the template that calls it. Check before planning:

```bash
rg -n "if\s*\(\s*!\s*function_exists" --glob '*.php' | wc -l
```

**Removing parent hooks — works, but timing matters.** The parent may not have added its hook yet when the child's `functions.php` runs, so defer:

```php
add_action( 'after_setup_theme', function () {
    remove_action( 'mytheme_footer', 'mytheme_render_credits' );
}, 11 );   // after the parent's own after_setup_theme callbacks
```

Removing a hook that is a **class method** needs the object instance. When the parent used `new Class()` inline with no stored reference, you need the global `$wp_filter` walk — see how commercial themes ship a `remove_filters_for_anonymous_class()` helper for exactly this. If the parent gives you no handle, this is a sign the override belongs elsewhere.

### Other files

| File | Behaviour |
|---|---|
| `style.css` | Child's loads; parent's must be enqueued explicitly |
| `functions.php` | **Both** run, child first |
| Templates | Child replaces parent |
| `theme.json` | Child's is **merged** over the parent's, key by key — you only need to declare what differs |
| `screenshot.png` | Child's is used |
| `languages/` | Child needs its own `load_child_theme_textdomain()` |
| `rtl.css` | Child's used if present |

`theme.json` merging is genuinely useful: a child can override one colour without restating the entire palette.

## Overriding assets and images

The parent's `get_template_directory_uri()` calls always point at the parent. To replace an image or script, either override the template that references it, or filter the URL if the parent offers a filter. Where neither exists, dequeue and re-enqueue:

```php
add_action( 'wp_enqueue_scripts', function () {
    wp_dequeue_script( 'mytheme-slider' );
    wp_enqueue_script( 'mytheme-child-slider', get_stylesheet_directory_uri() . '/assets/js/slider.js', array( 'jquery' ), '1.0.0', true );
}, 100 );   // late, so the parent has registered first
```

## Translations

```php
add_action( 'after_setup_theme', function () {
    load_child_theme_textdomain( 'mytheme-child', get_stylesheet_directory() . '/languages' );
} );
```

Strings you copy from a parent template keep the **parent's** text domain — leave them alone. Only strings you write yourself use the child's domain. Mixing domains within one file is normal and correct here.

## When a child theme is the wrong tool

Child themes are for *presentation*. Reach for something else when:

- **The change is functionality, not looks** — custom post types, shortcodes, integrations. Put it in a site-specific plugin. Content should survive a theme switch; a CPT registered in a theme takes its content with it into invisibility.
- **You only need CSS.** Additional CSS in the Customizer, or a small CSS plugin, is less to maintain than a whole theme.
- **You are overriding more than a handful of templates.** At that point you are maintaining a fork with extra steps. Consider building a proper theme, or a starter theme.
- **The parent has no `function_exists` guards and no filters.** You will be fighting it. Evaluate a different parent.

## Debugging "my override isn't working"

Work through in this order:

1. **Is the child active?** Appearance → Themes. Activating the parent by accident after an update is common.
2. **Does `Template:` match the parent folder name exactly?** Case-sensitive, and it is the *directory*, not the display name.
3. **Is the file path identical?** `template-parts/content.php` and `template_parts/content.php` are different files.
4. **Is CSS load order right?** Inspect in the browser: the child's `style.css` must come after the parent's. If not, the dependency array is wrong.
5. **Is specificity the problem?** The child's rule may load last and still lose. Check the computed styles, and do not reach for `!important` before you have looked.
6. **Is the parent using `get_template_directory_uri()` for that asset?** Then it will never point at your child.
7. **Is the template even being used?** Confirm with `template_include` — see the `wp-theme-classic` skill.
8. **Is a caching layer serving stale CSS?** Bump the child version in `style.css` and purge.

## Scaffold

```php
<?php
/**
 * Child theme functions.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'MYTHEME_CHILD_VERSION', wp_get_theme()->get( 'Version' ) );

add_action( 'wp_enqueue_scripts', 'mytheme_child_enqueue', 20 );
function mytheme_child_enqueue() {
    wp_enqueue_style(
        'mytheme-child',
        get_stylesheet_directory_uri() . '/style.css',
        array( 'mytheme' ),
        MYTHEME_CHILD_VERSION
    );
}

add_action( 'after_setup_theme', function () {
    load_child_theme_textdomain( 'mytheme-child', get_stylesheet_directory() . '/languages' );
} );
```
