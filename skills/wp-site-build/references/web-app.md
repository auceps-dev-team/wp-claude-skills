# The web-app branch

Membership areas, booking, client portals, dashboards, directories, marketplaces: sites where logged-in users *do work*, not just read.

**Nothing in this file was measured on a build yet.** It is the method's structure applied to a case it has not been run on, and it routes to the skills that hold measured material. When a web-app build happens, record what it measured here, the way `store.md` records the store build — and soften or remove anything below that it contradicts.

## What stays the same

- **Brief, reference, register gate.** An app has a register too. Application screens are where models drift hardest toward the generic admin look (grey cards, blue primary buttons, an icon in every heading); the seven invariants apply to the dashboard as much as to the home page.
- **Mockup first, including the app screens.** Dashboards, forms, empty states, error states and lists are drawn in local HTML like any page, with realistic data — a dashboard drawn empty hides every layout problem a full one has. The five-second loop matters more here, because app screens have more states than pages.
- **Block theme for everything public.** Marketing pages, pricing, help, legal: the showcase branch, unchanged.
- **Tools, staging, the deployment gate, the five gates.**

## What changes

### Application logic lives in a plugin, never in the theme

A theme is replaced in a redesign; the users' data must survive it. Custom post types, taxonomies, roles and capabilities, REST routes, cron jobs, custom tables and their migrations go into a plugin the theme does not own. See `wp-plugin-architecture` for the lifecycle, autoloading, the Settings API, REST and custom tables, and `wp-standards` for capabilities and nonces.

The install tool creates pages and settings; the plugin's own activation and versioned migrations create its schema. Do not let `tools/install-site.php` create tables: on production the plugin must be able to upgrade itself without the tool.

### App screens are dynamic blocks

The rule "no `core/html`" still holds, and an app screen is not a static page. Each screen that shows user data is a **dynamic block** registered by the plugin — `block.json` with a `render` file, server-side rendering, the client's editor seeing a preview — placed in an ordinary page that the client can still edit around. Client-side behaviour (filters, inline edits, live counters) uses the Interactivity API rather than a separate front-end framework, so the markup stays server-rendered and the blocks stay valid. See `wp-blocks-gutenberg`.

The mockup's classes go on the dynamic block's wrapper exactly as `className` does on core blocks (`block-conversion.md`), so the CSS written in phase 2 keeps working.

### Logged-in flows need their own pages and tests

Registration, login, password reset, account, and every role-specific screen are pages in the page set, drawn in the mockup, not left to the default `wp-login.php` look. If the site is also a store, WooCommerce's account page can host them; otherwise the plugin provides them as blocks.

## Gates, adjusted

| Gate | Adjustment |
|---|---|
| 1 · Integrity | The allow-list includes the app plugin's block namespace. |
| 2 · Editor | Unchanged — dynamic blocks validate trivially, the pages around them do not. |
| 3 · Rendering | Run once per role, logged in as a local test account of that role, plus logged out. Test accounts exist on staging only. |
| 4 · Pixel | On app screens, with the same seeded data on the mockup and the site. |
| 5 · Editor fidelity | Unchanged. |
| + Security | Run `wp-security-audit`'s scanner on the plugin before acceptance, and fix every finding of high severity or above: an app plugin is exactly the code that scanner was built for — AJAX and REST handlers, uploads, capability checks. |
| + Performance | Logged-in pages bypass page caches; measure them logged in (`wp-performance`). |

## Build or install

Before writing a booking or membership system, check whether a maintained plugin covers 80 % of it and the remaining 20 % can be a small plugin on top. The method does not change either way — the mockup decides the screens, the plugin provides the data — but the security and maintenance burden does. Present both to the client with what each costs; it is their decision.
