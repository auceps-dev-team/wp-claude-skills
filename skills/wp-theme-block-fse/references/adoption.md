# Adopting blocks in an existing theme

## Common failures

| Symptom | Cause |
|---|---|
| theme.json change has no effect | The user customized that value in the Site Editor; DB wins. Reset via Site Editor → Styles → Revisions, or delete the `wp_global_styles` post. |
| Template edits have no effect | Same: an edited template is stored as a `wp_template` post. The Site Editor shows "Customized" and offers "Clear customizations". |
| Colours missing from the picker | `settings.color.palette` not set, or `defaultPalette: false` with no palette provided. |
| Editor looks different from front end | Front-end CSS not expressed in `theme.json` and not registered with `add_editor_style()`. |
| Fonts not loading | `fontFace.src` must use the `file:./` prefix for theme-relative paths. |
| Spacing presets absent | `spacingScale.steps` defaults to 7 generated steps; setting `steps: 0` without providing `spacingSizes` removes them entirely. |
| Wide/full alignment does nothing | `settings.layout` missing, or the block is not inside a `constrained` layout. |

## Migration order

Converting a classic theme to blocks, in the order that keeps the site working throughout:

1. Add `theme.json` with settings only (palette, sizes, spacing). Nothing breaks.
2. Move styling into `styles` progressively; delete the CSS it replaces.
3. Convert `header.php` / `footer.php` into `parts/*.html`.
4. Add `templates/index.html` — **this flips the theme to block mode**, so have the other templates ready.
5. Convert remaining templates.
6. Convert reusable layouts into patterns.
7. Add style variations last.

Step 4 is the point of no return in each release. Ship steps 1–3 first and let them settle.
