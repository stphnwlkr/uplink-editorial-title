=== Uplink Editorial Title ===
Contributors: uplinkpress
Tags: editorial, title, gutenberg, block editor, dynamic data
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.3
Stable tag: 1.2.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Adds an optional editorial display title with safe inline formatting, CSS classes, native core block output, Etch data, and Bricks dynamic data.

== Description ==

Uplink Editorial Title keeps the canonical WordPress post title clean while providing an optional editorial display title in the block editor.

Allowed inline markup is deliberately restricted to:

* strong
* emphasis
* highlight (mark), with optional custom color
* strikethrough
* subscript
* superscript

The plugin also stores an optional space-separated CSS class list. The standard WordPress title is never replaced globally.

== Settings ==

Open Settings > Editorial Title to choose:

* Enabled block-editor post types
* Allowed inline title formats
* The default heading level for Editorial Title blocks without an explicit level
* Optional default CSS classes added only to the Editorial Title block wrapper

The heading level and CSS class controls appear together under Default Block Settings.

All eligible post types and all supported formats are enabled until an administrator saves a different selection.

== Core templates and patterns ==

Insert the Editorial Title block from the Theme block category in the Site Editor, template editor, or pattern editor.

The block is dynamic and uses the current post context. It therefore works in singular templates and in post-context containers such as Query Loop items.

The block defaults to the heading level selected in the plugin settings and provides an H1-H6 heading-level control. Block-default and per-post Editorial Title classes are added automatically. Core Additional CSS Classes and anchor support are also available on the block.

Block markup for a pattern or template can also be written directly:

`<!-- wp:uplink/editorial-title {"level":1} /-->`

== PHP usage ==

`uplink_get_editorial_title( $post )`

Returns the sanitized editorial title, or the escaped canonical title when no editorial title is set.

`uplink_get_editorial_title_class( $post )`

Returns the sanitized space-separated CSS class string.

Meta keys:

* `uplink_editorial_title`
* `uplink_editorial_title_class`

== Etch ==

Post dynamic-data keys:

* `{this.editorial_title}`
* `{this.editorial_title_class}`

Inside loops, use the applicable loop item key, for example:

* `{item.editorial_title}`
* `{item.editorial_title_class}`

== Bricks ==

The plugin adds these tags to the Post dynamic-data group:

* `{uplink_editorial_title}`
* `{uplink_editorial_title_class}`

== Security ==

Editorial title markup is sanitized against the administrator-selected strict HTML allowlist. Highlight text and background colors are stored as validated data and rendered only as `color` and `background-color` values. CSS class values are sanitized individually. Settings require administrator access, and meta writes require permission to edit the target post.

== Changelog ==

= 1.2.1 =
* Polishes the settings screen with the established UplinkPress visual system and responsive card layout.
* Adds the UplinkPress logo to the settings screen.
* Adds a direct Settings link on the WordPress Plugins screen.

= 1.2.0 =
* Adds Settings > Editorial Title for choosing enabled post types and allowed inline formats.
* Enables every eligible post type and supported format by default.
* Adds a configurable default heading level for newly inserted Editorial Title blocks.
* Adds sanitized default CSS classes to the Editorial Title block wrapper.

= 1.1.3 =
* Fixes the expanded RichText editor so saved text and background highlight colors render immediately and after reload.
* Keeps inline preview styles editor-only and converts them back to validated data before saving.
* Fixes active toolbar button contrast during hover and keyboard focus.

= 1.1.2 =
* Adds native-style Text and Background tabs to the Highlight color control.
* Adds a separately validated text color for highlighted title text.
* Fixes the expanded editor preview so assigned highlight colors replace the browser's default yellow.
* Adds the native H1-H6 heading-level dropdown to the Editorial Title block toolbar.

= 1.1.1 =
* Fixes custom highlight colors being passed to Gutenberg's format toggler as an object-shaped format type.
* Replaces the free-form CSS color field with WordPress's native color palette, including theme and editor colors.
* Respects the editor's custom-color setting while keeping existing saved advanced color values compatible.

= 1.1.0 =
* Adds a native-style highlight color picker.
* Adds a CSS color-value field for custom properties such as `var(--primary)` and modern functions such as `color-mix(...)`.
* Stores highlight color as constrained data and converts it to `background-color` only after server-side validation.
* Keeps uncolored `<mark>` elements theme-driven.

= 1.0.0 =
* Initial normalized release.
* Requires WordPress 7.0 or later and PHP 8.3 or later.
* Tested through WordPress 7.1.
* Provides the polished contextual editorial-title editor with strong, emphasis, highlight, strikethrough, subscript, and superscript formatting.
* Adds per-post CSS class assignment.
* Adds native Etch post dynamic data.
* Adds native Bricks Post-group dynamic-data tags.
* Adds a dynamic Editorial Title block for core templates and patterns.
