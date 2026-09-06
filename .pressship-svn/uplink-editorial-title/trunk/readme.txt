=== Uplink Editorial Title ===
Contributors: stphnwlkr
Tags: editorial, title, gutenberg, block editor, dynamic data
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.3
Stable tag: 1.0.1
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

Underline is intentionally not included and is not planned for a future release. Underlined text is widely understood to be a hyperlink, so using it as decoration can make a title misleading. A site that deliberately wants this treatment can assign a custom CSS class to the editorial title and apply `text-decoration` in its theme CSS. The same approach can restyle an existing inline format such as strong, emphasis, or highlight.

The plugin also stores an optional space-separated CSS class list. The standard WordPress title is never replaced globally.

== Installation ==

1. Upload the plugin ZIP through Plugins > Add New > Upload Plugin, or copy the `uplink-editorial-title` directory to `/wp-content/plugins/`.
2. Activate Uplink Editorial Title from the Plugins screen.
3. Open Settings > Editorial Title to choose enabled post types, formats, and block defaults.
4. Edit a supported post and open the Editorial Title panel in the editor sidebar.

== Settings ==

Open Settings > Editorial Title to choose:

* Enabled block-editor post types
* Allowed inline title formats
* The default paragraph or heading element for Editorial Title blocks without an explicit level
* Optional default CSS classes added only to the Editorial Title block wrapper

The block element and CSS class controls appear together under Default Block Settings.

All eligible post types and all supported formats are enabled until an administrator saves a different selection.

== Core templates and patterns ==

Insert the Editorial Title block from the Theme block category in the Site Editor, template editor, or pattern editor.

The block is dynamic and uses the current post context. It therefore works in singular templates and in post-context containers such as Query Loop items.

The block defaults to the site default element selected in the plugin settings. While a heading is active, its toolbar includes a Use paragraph button. Once Paragraph is active, that extra button disappears and the native element control shows P, avoiding duplicate controls. Paragraph renders a `<p>` element, so display or demonstration text does not enter the page's heading structure. Block-default and per-post Editorial Title classes are added automatically. Core Additional CSS Classes and anchor support are also available on the block.

Block markup for a pattern or template can also be written directly:

`<!-- wp:uplink/editorial-title {"level":1} /-->`

Paragraph markup uses level `0`:

`<!-- wp:uplink/editorial-title {"level":0} /-->`

Both forms are self-closing dynamic blocks.

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

= 1.0.1 =
* Corrected the plugin author metadata to identify Stephen Walker and link to the `stphnwlkr` WordPress.org profile.

= 1.0.0 =
* Initial WordPress.org release.
* Requires WordPress 7.0 or later and PHP 8.3 or later.
* Tested through WordPress 7.1.
* Adds the contextual editorial-title editor with configurable strong, emphasis, highlight, strikethrough, subscript, and superscript formatting.
* Adds separate Use current title and Reset to post title sidebar actions while keeping the formatting popover focused on editing.
* Adds validated text and background highlight colors through the native palette and advanced CSS values such as `var(...)` and `color-mix(...)`.
* Adds per-post and default CSS class assignment.
* Adds settings for post types, allowed formats, default heading level, and default block classes.
* Adds a dynamic Editorial Title block for core templates and patterns.
* Supports paragraph output when an editorial title should not enter the document heading structure.
* Adds native Etch post data and Bricks Post-group dynamic-data tags.
* Prevents object-shaped RichText format values from corrupting saved markup.
