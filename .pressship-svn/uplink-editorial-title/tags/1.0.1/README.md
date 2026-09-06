# Uplink Editorial Title

**Version:** 1.0.1  
**Requires WordPress:** 7.0+  
**Tested through:** 7.1  
**Requires PHP:** 8.3+

Uplink Editorial Title provides an optional, safely formatted display title while leaving the canonical WordPress title untouched.

Editors can apply only editorial inline formatting: **strong**, *emphasis*, `<mark>highlight</mark>`, strikethrough, subscript, and superscript. An optional CSS class list can also be stored per post.

Underline is intentionally not included and is not planned for a future release. Underlined text is widely understood to be a hyperlink, so using it as decoration can make a title misleading. A site that deliberately wants this treatment can assign a custom CSS class to the editorial title and apply `text-decoration` in its theme CSS. The same approach can restyle an existing inline format such as strong, emphasis, or highlight.

## Settings

Open **Settings → Editorial Title** to choose which eligible block-editor post types use Editorial Title and which inline formats are available. **Default Block Settings** controls the fallback block element and optional classes for the Editorial Title block wrapper. New installations enable every eligible post type and every supported format.

## Core templates and patterns

Insert **Editorial Title** from the Theme block category. It is a dynamic block that resolves against the current post context and falls back to the standard post title when no editorial title exists.

Direct block markup:

```html
<!-- wp:uplink/editorial-title {"level":1} /-->
```

While a heading is active, the block toolbar includes a **Use paragraph** button. Once Paragraph is active, that extra button disappears and the native element control shows P, avoiding duplicate controls. The plugin settings identify the site default block element. Paragraph renders a `<p>` element, so display or demonstration text does not enter the page's heading structure. Core Additional CSS Classes and anchors are also supported. Block-default and per-post Editorial Title classes are appended automatically.

Paragraph block markup:

```html
<!-- wp:uplink/editorial-title {"level":0} /-->
```

## PHP

```php
uplink_get_editorial_title( $post );
uplink_get_editorial_title_class( $post );
```

## Etch

```text
{this.editorial_title}
{this.editorial_title_class}
```

Loop item example:

```text
{item.editorial_title}
{item.editorial_title_class}
```

## Bricks

Available in the **Post** dynamic-data group:

```text
{uplink_editorial_title}
{uplink_editorial_title_class}
```

## Security

Editorial HTML is limited server-side to the formats enabled in the settings screen. CSS classes are sanitized individually, settings require administrator access, and meta writes require permission to edit the target post.


## Highlight colors

Select text and open Highlight to choose separate Text and Background colors from WordPress's native color palette. Theme and editor palette colors appear automatically, and the custom color control follows the site's editor settings. Clearing both colors removes the highlight format.

The CSS color value field also accepts validated advanced values such as `var(--primary)` and `color-mix(in oklch, yellow 50%, transparent)`.
