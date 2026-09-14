<?php
/**
 * Plugin Name:       Uplink Editorial Title
 * Description:       Adds an optional editorial display title with safe inline formatting and CSS class assignment to the WordPress block editor.
 * Version:           1.1.2
 * Requires at least: 7.0
 * Requires PHP:      8.3
 * Author:            Stephen Walker
 * Author URI:        https://profiles.wordpress.org/stphnwlkr/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       uplink-editorial-title
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Uplink_Editorial_Title {
	public const VERSION         = '1.1.2';
	public const META_TITLE      = 'uplink_editorial_title';
	public const META_CLASS      = 'uplink_editorial_title_class';
	public const OPTION_SETTINGS = 'uplink_editorial_title_settings';
	public const OPTION_VERSION  = 'uplink_editorial_title_version';
	private static string $settings_page_hook = '';

	/**
	 * Return a cache version that changes when a bundled asset changes.
	 */
	private static function asset_version( string $relative_path ): string {
		$path     = plugin_dir_path( __FILE__ ) . ltrim( $relative_path, '/' );
		$modified = is_file( $path ) ? filemtime( $path ) : false;

		return false !== $modified ? self::VERSION . '.' . $modified : self::VERSION;
	}

	/**
	 * Initialize plugin hooks.
	 */
	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'maybe_upgrade_settings' ), 10 );
		add_action( 'init', array( __CLASS__, 'register_meta' ), 20 );
		add_action( 'enqueue_block_editor_assets', array( __CLASS__, 'enqueue_editor_assets' ) );
		add_action( 'init', array( __CLASS__, 'register_editorial_title_block' ), 30 );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_menu', array( __CLASS__, 'add_settings_page' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_settings_assets' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), array( __CLASS__, 'add_settings_link' ) );

		// Etch dynamic data integration.
		add_filter( 'etch/dynamic_data/post', array( __CLASS__, 'add_etch_dynamic_data' ), 10, 2 );

		// Bricks dynamic data integration.
		add_filter( 'bricks/dynamic_tags_list', array( __CLASS__, 'register_bricks_dynamic_tags' ) );
		add_filter( 'bricks/dynamic_data/render_tag', array( __CLASS__, 'render_bricks_dynamic_tag' ), 20, 3 );
		add_filter( 'bricks/dynamic_data/render_content', array( __CLASS__, 'render_bricks_dynamic_content' ), 20, 3 );
		add_filter( 'bricks/frontend/render_data', array( __CLASS__, 'render_bricks_dynamic_content' ), 20, 2 );
	}

	/**
	 * Return the supported editorial formats and their editor format names.
	 */
	private static function format_definitions(): array {
		return array(
			'strong' => array(
				'label'         => __( 'Strong', 'uplink-editorial-title' ),
				'editor_format' => 'core/bold',
			),
			'em'     => array(
				'label'         => __( 'Emphasis', 'uplink-editorial-title' ),
				'editor_format' => 'core/italic',
			),
			'mark'   => array(
				'label'         => __( 'Highlight', 'uplink-editorial-title' ),
				'editor_format' => 'uplink-editorial-title/highlight',
			),
			'span'   => array(
				'label'         => __( 'Inline span', 'uplink-editorial-title' ),
				'editor_format' => 'uplink-editorial-title/inline-class',
			),
			's'      => array(
				'label'         => __( 'Strikethrough', 'uplink-editorial-title' ),
				'editor_format' => 'core/strikethrough',
			),
			'sub'    => array(
				'label'         => __( 'Subscript', 'uplink-editorial-title' ),
				'editor_format' => 'core/subscript',
			),
			'sup'    => array(
				'label'         => __( 'Superscript', 'uplink-editorial-title' ),
				'editor_format' => 'core/superscript',
			),
		);
	}

	/**
	 * Enable newly introduced formats once when an existing site upgrades.
	 */
	public static function maybe_upgrade_settings(): void {
		$installed_version = (string) get_option( self::OPTION_VERSION, '' );

		if ( version_compare( $installed_version, self::VERSION, '>=' ) ) {
			return;
		}

		if ( version_compare( $installed_version, '1.0.4', '<' ) ) {
			$stored = get_option( self::OPTION_SETTINGS, false );
			if ( is_array( $stored ) ) {
				$formats = is_array( $stored['formats'] ?? null ) ? $stored['formats'] : array();
				if ( ! in_array( 'span', $formats, true ) ) {
					$formats[]         = 'span';
					$stored['formats'] = $formats;
					update_option( self::OPTION_SETTINGS, $stored );
				}
			}
		}

		update_option( self::OPTION_VERSION, self::VERSION );
	}

	/**
	 * Return post types that can use the block editor and REST-backed metadata.
	 *
	 * @return array<string,WP_Post_Type>
	 */
	public static function get_eligible_post_types(): array {
		$post_types = get_post_types(
			array(
				'show_ui'      => true,
				'show_in_rest' => true,
			),
			'objects'
		);

		foreach ( $post_types as $name => $post_type ) {
			if ( 'attachment' === $name || str_starts_with( $name, 'wp_' ) ) {
				unset( $post_types[ $name ] );
			}
		}

		return $post_types;
	}

	/**
	 * Return normalized plugin settings. A new install enables every option.
	 */
	public static function get_settings(): array {
		$post_types = array_keys( self::get_eligible_post_types() );
		$formats    = array_keys( self::format_definitions() );
		$defaults   = array(
			'post_types'          => $post_types,
			'formats'             => $formats,
			'default_block_level' => 2,
			'default_classes'     => '',
		);
		$stored     = get_option( self::OPTION_SETTINGS, false );

		if ( false === $stored || ! is_array( $stored ) ) {
			return $defaults;
		}

		return array(
			'post_types'          => array_values( array_intersect( $post_types, is_array( $stored['post_types'] ?? null ) ? $stored['post_types'] : array() ) ),
			'formats'             => array_values( array_intersect( $formats, is_array( $stored['formats'] ?? null ) ? $stored['formats'] : array() ) ),
			'default_block_level' => max( 0, min( 6, (int) ( $stored['default_block_level'] ?? 2 ) ) ),
			'default_classes'     => self::sanitize_classes( (string) ( $stored['default_classes'] ?? '' ) ),
		);
	}

	/**
	 * Sanitize the Settings API payload.
	 */
	public static function sanitize_settings( $value ): array {
		$value               = is_array( $value ) ? $value : array();
		$valid_post_types    = array_keys( self::get_eligible_post_types() );
		$valid_formats       = array_keys( self::format_definitions() );
		$selected_post_types = is_array( $value['post_types'] ?? null ) ? array_map( 'sanitize_key', $value['post_types'] ) : array();
		$selected_formats    = is_array( $value['formats'] ?? null ) ? array_map( 'sanitize_key', $value['formats'] ) : array();

		return array(
			'post_types'          => array_values( array_intersect( $valid_post_types, $selected_post_types ) ),
			'formats'             => array_values( array_intersect( $valid_formats, $selected_formats ) ),
			'default_block_level' => max( 0, min( 6, (int) ( $value['default_block_level'] ?? 2 ) ) ),
			'default_classes'     => self::sanitize_classes( (string) ( $value['default_classes'] ?? '' ) ),
		);
	}

	/**
	 * Register the plugin's single settings option.
	 */
	public static function register_settings(): void {
		register_setting(
			'uplink_editorial_title',
			self::OPTION_SETTINGS,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
			)
		);
	}

	/**
	 * Add the settings screen under WordPress Settings.
	 */
	public static function add_settings_page(): void {
		self::$settings_page_hook = (string) add_options_page(
			__( 'Uplink Editorial Title', 'uplink-editorial-title' ),
			__( 'Editorial Title', 'uplink-editorial-title' ),
			'manage_options',
			'uplink-editorial-title',
			array( __CLASS__, 'render_settings_page' )
		);
	}

	/**
	 * Load the branded stylesheet only on this plugin's settings screen.
	 */
	public static function enqueue_settings_assets( string $hook_suffix ): void {
		if ( self::$settings_page_hook !== $hook_suffix ) {
			return;
		}

		wp_enqueue_style(
			'uplink-editorial-title-admin',
			plugin_dir_url( __FILE__ ) . 'assets/admin.css',
			array(),
			self::asset_version( 'assets/admin.css' )
		);
	}

	/**
	 * Add a direct settings link on the Plugins screen.
	 *
	 * @param string[] $links Existing plugin action links.
	 * @return string[]
	 */
	public static function add_settings_link( array $links ): array {
		array_unshift(
			$links,
			'<a href="' . esc_url( admin_url( 'options-general.php?page=uplink-editorial-title' ) ) . '">' . esc_html__( 'Settings', 'uplink-editorial-title' ) . '</a>'
		);

		return $links;
	}

	/**
	 * Render the settings screen with native WordPress controls.
	 */
	public static function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to manage these settings.', 'uplink-editorial-title' ) );
		}

		$settings   = self::get_settings();
		$post_types = self::get_eligible_post_types();
		$formats    = self::format_definitions();
		?>
		<div class="wrap uet-admin">
			<h1 class="screen-reader-text"><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<header class="uet-admin__hero">
				<div class="uet-admin__brand">
					<span class="uet-admin__brand-mark" aria-hidden="true">
						<img src="<?php echo esc_url( plugin_dir_url( __FILE__ ) . 'assets/images/uplinkpress-logo.svg' ); ?>" alt="" width="72" height="58">
					</span>
					<div>
						<span class="uet-admin__eyebrow"><?php esc_html_e( 'Editorial workflow', 'uplink-editorial-title' ); ?></span>
						<div class="uet-admin__title" aria-hidden="true"><?php echo esc_html( get_admin_page_title() ); ?></div>
						<p><?php esc_html_e( 'Give display titles expressive, controlled formatting without changing the canonical WordPress title.', 'uplink-editorial-title' ); ?></p>
					</div>
				</div>
				<div class="uet-admin__badges" aria-label="<?php esc_attr_e( 'Plugin features', 'uplink-editorial-title' ); ?>">
					<span><?php esc_html_e( 'Safe HTML', 'uplink-editorial-title' ); ?></span>
					<span><?php esc_html_e( 'Paragraph or H1–H6', 'uplink-editorial-title' ); ?></span>
				</div>
			</header>

			<form action="options.php" method="post">
				<?php settings_fields( 'uplink_editorial_title' ); ?>
				<div class="uet-admin__layout">
					<main class="uet-admin__main">
						<section class="uet-card" aria-labelledby="uet-availability-title">
							<div class="uet-card__header">
								<h2 id="uet-availability-title"><?php esc_html_e( 'Editor availability', 'uplink-editorial-title' ); ?></h2>
								<p><?php esc_html_e( 'Choose the post types that show the Editorial Title document panel.', 'uplink-editorial-title' ); ?></p>
							</div>
							<fieldset class="uet-option-grid">
								<legend class="screen-reader-text"><?php esc_html_e( 'Enabled post types', 'uplink-editorial-title' ); ?></legend>
								<?php foreach ( $post_types as $name => $post_type ) : ?>
									<?php $field_id = 'uet-post-type-' . sanitize_html_class( $name ); ?>
									<label class="uet-option" for="<?php echo esc_attr( $field_id ); ?>">
										<input id="<?php echo esc_attr( $field_id ); ?>" type="checkbox" name="<?php echo esc_attr( self::OPTION_SETTINGS ); ?>[post_types][]" value="<?php echo esc_attr( $name ); ?>" <?php checked( in_array( $name, $settings['post_types'], true ) ); ?>>
										<span><strong><?php echo esc_html( $post_type->labels->name ); ?></strong><small><?php echo esc_html( $name ); ?></small></span>
									</label>
								<?php endforeach; ?>
							</fieldset>
						</section>

						<section class="uet-card" aria-labelledby="uet-formats-title">
							<div class="uet-card__header">
								<h2 id="uet-formats-title"><?php esc_html_e( 'Allowed inline formatting', 'uplink-editorial-title' ); ?></h2>
								<p><?php esc_html_e( 'Only selected formats appear in the editor and pass the server-side HTML allowlist.', 'uplink-editorial-title' ); ?></p>
							</div>
							<fieldset class="uet-option-grid uet-option-grid--formats">
								<legend class="screen-reader-text"><?php esc_html_e( 'Allowed HTML formats', 'uplink-editorial-title' ); ?></legend>
								<?php foreach ( $formats as $tag => $definition ) : ?>
									<?php $field_id = 'uet-format-' . sanitize_html_class( $tag ); ?>
									<label class="uet-option" for="<?php echo esc_attr( $field_id ); ?>">
										<input id="<?php echo esc_attr( $field_id ); ?>" type="checkbox" name="<?php echo esc_attr( self::OPTION_SETTINGS ); ?>[formats][]" value="<?php echo esc_attr( $tag ); ?>" <?php checked( in_array( $tag, $settings['formats'], true ) ); ?>>
										<span><strong><?php echo esc_html( $definition['label'] ); ?></strong><code>&lt;<?php echo esc_html( $tag ); ?>&gt;</code></span>
									</label>
								<?php endforeach; ?>
							</fieldset>
							<p class="uet-card__note"><?php esc_html_e( 'Disabling a format leaves stored title data intact, but excludes that markup from rendering and future saves.', 'uplink-editorial-title' ); ?></p>
							<p class="uet-card__note"><?php esc_html_e( 'Underline is intentionally unavailable because readers may mistake it for a hyperlink. Sites that need the effect can use a custom CSS class or restyle an enabled inline format.', 'uplink-editorial-title' ); ?></p>
						</section>

						<section class="uet-card" aria-labelledby="uet-defaults-title">
							<div class="uet-card__header">
								<h2 id="uet-defaults-title"><?php esc_html_e( 'Default Block Settings', 'uplink-editorial-title' ); ?></h2>
								<p><?php esc_html_e( 'Choose the defaults used by Editorial Title blocks.', 'uplink-editorial-title' ); ?></p>
							</div>
							<div class="uet-fields">
								<div class="uet-field">
									<label for="uet-default-level"><?php esc_html_e( 'Site default block element', 'uplink-editorial-title' ); ?></label>
									<div>
										<select id="uet-default-level" name="<?php echo esc_attr( self::OPTION_SETTINGS ); ?>[default_block_level]">
											<option value="0" <?php selected( $settings['default_block_level'], 0 ); ?>><?php esc_html_e( 'Paragraph', 'uplink-editorial-title' ); ?></option>
											<?php for ( $level = 1; $level <= 6; $level++ ) : ?>
												<option value="<?php echo esc_attr( (string) $level ); ?>" <?php selected( $settings['default_block_level'], $level ); ?>>H<?php echo esc_html( (string) $level ); ?></option>
											<?php endfor; ?>
										</select>
										<p class="description"><?php esc_html_e( 'New Editorial Title blocks inherit this site default. Choose Paragraph for display text that should not be part of the heading structure.', 'uplink-editorial-title' ); ?></p>
									</div>
								</div>
								<div class="uet-field">
									<label for="uet-default-classes"><?php esc_html_e( 'Block default CSS classes', 'uplink-editorial-title' ); ?></label>
									<div>
										<input id="uet-default-classes" class="regular-text" type="text" name="<?php echo esc_attr( self::OPTION_SETTINGS ); ?>[default_classes]" value="<?php echo esc_attr( $settings['default_classes'] ); ?>" placeholder="editorial-title" autocomplete="off" spellcheck="false">
										<p class="description"><?php esc_html_e( 'Optional space-separated classes added only to the Editorial Title block wrapper.', 'uplink-editorial-title' ); ?></p>
									</div>
								</div>
							</div>
							<div class="uet-card__footer">
								<?php submit_button( esc_html__( 'Save changes', 'uplink-editorial-title' ), 'primary', 'submit', false ); ?>
								<span><?php esc_html_e( 'The canonical WordPress title is never changed.', 'uplink-editorial-title' ); ?></span>
							</div>
						</section>
					</main>

					<aside class="uet-admin__sidebar" aria-label="<?php esc_attr_e( 'Plugin information', 'uplink-editorial-title' ); ?>">
						<section class="uet-card uet-card--compact">
							<h2><?php esc_html_e( 'How it works', 'uplink-editorial-title' ); ?></h2>
							<ol class="uet-steps">
								<li><span>1</span><?php esc_html_e( 'Write an optional display title in the post editor.', 'uplink-editorial-title' ); ?></li>
								<li><span>2</span><?php esc_html_e( 'Apply only the editorial formats allowed here.', 'uplink-editorial-title' ); ?></li>
								<li><span>3</span><?php esc_html_e( 'Render it with the block or dynamic data integrations.', 'uplink-editorial-title' ); ?></li>
							</ol>
						</section>

						<section class="uet-card uet-card--compact">
							<h2><?php esc_html_e( 'Output options', 'uplink-editorial-title' ); ?></h2>
							<div class="uet-code-list">
								<div class="uet-code-item">
									<span><?php esc_html_e( 'Block', 'uplink-editorial-title' ); ?></span>
									<code>&lt;!-- wp:uplink/editorial-title /--&gt;</code>
								</div>
								<div class="uet-code-item">
									<span><?php esc_html_e( 'Etch', 'uplink-editorial-title' ); ?></span>
									<code>{this.editorial_title}</code>
								</div>
								<div class="uet-code-item">
									<span><?php esc_html_e( 'Bricks', 'uplink-editorial-title' ); ?></span>
									<code>{uplink_editorial_title}</code>
								</div>
								<div class="uet-code-item">
									<span><?php esc_html_e( 'PHP', 'uplink-editorial-title' ); ?></span>
									<code>uplink_get_editorial_title()</code>
								</div>
							</div>
						</section>

						<section class="uet-card uet-card--compact">
							<h2><?php esc_html_e( 'Content safety', 'uplink-editorial-title' ); ?></h2>
							<p><?php esc_html_e( 'Markup is checked against the selected allowlist on the server. Highlight colors and CSS classes are validated independently before output.', 'uplink-editorial-title' ); ?></p>
							<p class="uet-admin__quiet"><?php esc_html_e( 'Changing availability does not delete existing editorial title metadata.', 'uplink-editorial-title' ); ?></p>
						</section>
					</aside>
				</div>
			</form>
		</div>
		<?php
	}

	/**
	 * Register plugin post meta for REST/block-editor use.
	 */
	public static function register_meta(): void {
		$settings   = self::get_settings();
		$post_types = $settings['post_types'];

		foreach ( $post_types as $post_type ) {
			// REST-backed post meta requires custom-fields support.
			if ( ! post_type_supports( $post_type, 'custom-fields' ) ) {
				add_post_type_support( $post_type, 'custom-fields' );
			}

			register_post_meta(
				$post_type,
				self::META_TITLE,
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => true,
					'label'             => __( 'Editorial title', 'uplink-editorial-title' ),
					'description'       => __( 'Optional display title with restricted editorial inline formatting.', 'uplink-editorial-title' ),
					'sanitize_callback' => array( __CLASS__, 'sanitize_editorial_title' ),
					'auth_callback'     => array( __CLASS__, 'authorize_meta' ),
				)
			);

			register_post_meta(
				$post_type,
				self::META_CLASS,
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => true,
					'label'             => __( 'Editorial title CSS classes', 'uplink-editorial-title' ),
					'description'       => __( 'Space-separated CSS classes for the editorial title.', 'uplink-editorial-title' ),
					'sanitize_callback' => array( __CLASS__, 'sanitize_classes' ),
					'auth_callback'     => array( __CLASS__, 'authorize_meta' ),
				)
			);
		}
	}

	/**
	 * Restrict meta editing to users who can edit the current post.
	 */
	public static function authorize_meta( $allowed, string $meta_key, int $object_id ): bool { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed
		return $object_id > 0 && current_user_can( 'edit_post', $object_id );
	}

	/**
	 * Sanitize title markup to the plugin's editorial-only allowlist.
	 */
	public static function sanitize_editorial_title( $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$enabled_formats = self::get_settings()['formats'];
		$allowed_html    = array();

		foreach ( $enabled_formats as $tag ) {
			if ( 'mark' === $tag ) {
				$allowed_html[ $tag ] = array(
					'data-uet-mark-color'      => true,
					'data-uet-mark-text-color' => true,
				);
			} elseif ( 'span' === $tag ) {
				$allowed_html[ $tag ] = array(
					'class'                  => true,
					'data-uet-inline-class'  => true,
					'data-uet-letter-group'  => true,
					'data-uet-letter-index'  => true,
					'data-uet-letter-label'  => true,
				);
			} else {
				$allowed_html[ $tag ] = array();
			}
		}

		$sanitized = wp_kses(
			$value,
			$allowed_html
		);

		// Normalize every mark tag so only a validated color token can survive.
		if ( in_array( 'mark', $enabled_formats, true ) ) {
			$sanitized = preg_replace_callback(
				'/<mark\b([^>]*)>/i',
				static function ( array $matches ): string {
				$attributes       = $matches[1] ?? '';
				$background_color = '';
				$text_color       = '';

				if ( preg_match( '/data-uet-mark-color=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $color_match ) ) {
					$raw_color        = html_entity_decode( self::matched_attribute_value( $color_match ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
					$background_color = self::sanitize_highlight_color( $raw_color );
				}

				if ( preg_match( '/data-uet-mark-text-color=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $color_match ) ) {
					$raw_color  = html_entity_decode( self::matched_attribute_value( $color_match ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
					$text_color = self::sanitize_highlight_color( $raw_color );
				}

				if ( '' === $background_color && '' === $text_color ) {
					return '<mark>';
				}

				$normalized_attributes = '';
				if ( '' !== $background_color ) {
					$normalized_attributes .= ' data-uet-mark-color="' . esc_attr( $background_color ) . '"';
				}
				if ( '' !== $text_color ) {
					$normalized_attributes .= ' data-uet-mark-text-color="' . esc_attr( $text_color ) . '"';
				}

				return '<mark' . $normalized_attributes . '>';
				},
				$sanitized
			);
		}

		// Keep a private marker for RichText while storing user classes as data.
		if ( in_array( 'span', $enabled_formats, true ) ) {
			$sanitized = preg_replace_callback(
				'/<span\b([^>]*)>/i',
				static function ( array $matches ): string {
					$attributes   = $matches[1] ?? '';
					$classes      = '';
					$letter_group = '';
					$letter_index = '';
					$letter_label = '';

					if ( preg_match( '/data-uet-inline-class=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $class_match ) ) {
						$classes = html_entity_decode( self::matched_attribute_value( $class_match ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
					} elseif ( preg_match( '/class=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $class_match ) ) {
						$classes = html_entity_decode( self::matched_attribute_value( $class_match ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
					}

					if ( preg_match( '/data-uet-letter-group=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $group_match ) ) {
						$letter_group = self::sanitize_letter_group_id(
							html_entity_decode( self::matched_attribute_value( $group_match ), ENT_QUOTES | ENT_HTML5, 'UTF-8' )
						);
					}
					if ( preg_match( '/data-uet-letter-index=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $index_match ) ) {
						$raw_index = self::matched_attribute_value( $index_match );
						if ( preg_match( '/^\d{1,4}$/', $raw_index ) ) {
							$letter_index = (string) absint( $raw_index );
						}
					}
					if ( preg_match( '/data-uet-letter-label=(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $label_match ) ) {
						$letter_label = self::sanitize_letter_label(
							html_entity_decode( self::matched_attribute_value( $label_match ), ENT_QUOTES | ENT_HTML5, 'UTF-8' )
						);
					}

					if ( '' !== $letter_group && '' !== $letter_index ) {
						return '<span class="uet-letter" data-uet-letter-group="' . esc_attr( $letter_group ) .
							'" data-uet-letter-index="' . esc_attr( $letter_index ) . '">';
					}

					$classes = self::sanitize_inline_classes( $classes );
					return '<span class="uet-inline-class"' .
						( $classes ? ' data-uet-inline-class="' . esc_attr( $classes ) . '"' : '' ) .
						( $letter_group && $letter_label ? ' data-uet-letter-group="' . esc_attr( $letter_group ) . '"' : '' ) .
						( $letter_group && $letter_label ? ' data-uet-letter-label="' . esc_attr( $letter_label ) . '"' : '' ) . '>';
				},
				$sanitized
			);
		}

		return trim( is_string( $sanitized ) ? $sanitized : '' );
	}

	/**
	 * Return the value captured from a double- or single-quoted attribute.
	 */
	private static function matched_attribute_value( array $matches ): string {
		if ( isset( $matches[1] ) && '' !== $matches[1] ) {
			return $matches[1];
		}

		return isset( $matches[2] ) ? $matches[2] : '';
	}

	/**
	 * Validate a single CSS color value used by a mark element.
	 *
	 * The value is stored as data, not as a style declaration. This deliberately
	 * allows modern color functions and CSS custom properties while rejecting
	 * declaration separators, URLs, comments, at-rules, and other CSS syntax that
	 * could escape the target color property at render time.
	 */
	public static function sanitize_highlight_color( $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = trim( $value );

		if ( '' === $value || strlen( $value ) > 300 ) {
			return '';
		}

		if ( preg_match( '/[;{}<>"\'\\@\x00-\x1F\x7F]/', $value ) ) {
			return '';
		}

		if ( preg_match( '/\/\*|\*\/|url\s*\(|expression\s*\(|!important/i', $value ) ) {
			return '';
		}

		if ( ! preg_match( '/^[a-z0-9#%.,()\/+\-*\s_]+$/i', $value ) ) {
			return '';
		}

		$depth = 0;
		$length = strlen( $value );
		for ( $index = 0; $index < $length; $index++ ) {
			if ( '(' === $value[ $index ] ) {
				++$depth;
			} elseif ( ')' === $value[ $index ] ) {
				--$depth;
				if ( $depth < 0 ) {
					return '';
				}
			}
		}

		if ( 0 !== $depth ) {
			return '';
		}

		$allowed_functions = array(
			'var',
			'color-mix',
			'rgb',
			'rgba',
			'hsl',
			'hsla',
			'hwb',
			'lab',
			'lch',
			'oklab',
			'oklch',
			'color',
			'light-dark',
			'calc',
			'min',
			'max',
			'clamp',
		);

		if ( preg_match_all( '/([a-z][a-z0-9-]*)\s*\(/i', $value, $function_matches ) ) {
			foreach ( $function_matches[1] as $function_name ) {
				if ( ! in_array( strtolower( $function_name ), $allowed_functions, true ) ) {
					return '';
				}
			}
		}

		return $value;
	}

	/**
	 * Convert validated mark color data into narrowly scoped inline styles.
	 */
	public static function render_editorial_title_markup( string $value ): string {
		$value = self::sanitize_editorial_title( $value );

		$rendered = preg_replace_callback(
			'/<mark\b([^>]*)>/i',
			static function ( array $matches ): string {
				$attributes = $matches[1] ?? '';
				$styles     = array();

				if ( preg_match( '/data-uet-mark-color="([^"]*)"/i', $attributes, $color_match ) ) {
					$color = self::sanitize_highlight_color( html_entity_decode( $color_match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
					if ( '' !== $color ) {
						$styles[] = 'background-color:' . $color;
					}
				}

				if ( preg_match( '/data-uet-mark-text-color="([^"]*)"/i', $attributes, $color_match ) ) {
					$color = self::sanitize_highlight_color( html_entity_decode( $color_match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
					if ( '' !== $color ) {
						if ( ! $styles ) {
							$styles[] = 'background-color:transparent';
						}
						$styles[] = 'color:' . $color;
					}
				}

				return $styles ? '<mark style="' . esc_attr( implode( ';', $styles ) ) . '">' : '<mark>';
			},
			$value
		);

		$rendered = preg_replace_callback(
			'/<span\b([^>]*)>/i',
			static function ( array $matches ): string {
				$attributes   = $matches[1] ?? '';
				$classes      = '';
				$letter_group = '';
				$letter_label = '';

				if ( preg_match( '/data-uet-letter-index="\d{1,4}"/i', $attributes ) ) {
					return '<span aria-hidden="true">';
				}

				if ( preg_match( '/data-uet-inline-class="([^"]*)"/i', $attributes, $class_match ) ) {
					$classes = html_entity_decode( $class_match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
				}
				if ( preg_match( '/data-uet-letter-group="([^"]*)"/i', $attributes, $group_match ) ) {
					$letter_group = self::sanitize_letter_group_id( html_entity_decode( $group_match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
				}
				if ( preg_match( '/data-uet-letter-label="([^"]*)"/i', $attributes, $label_match ) ) {
					$letter_label = self::sanitize_letter_label( html_entity_decode( $label_match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
				}

				$classes = self::sanitize_inline_classes( $classes );
				return '<span' .
					( $classes ? ' class="' . esc_attr( $classes ) . '"' : '' ) .
					( $letter_group && $letter_label ? ' aria-label="' . esc_attr( $letter_label ) . '"' : '' ) . '>';
			},
			is_string( $rendered ) ? $rendered : ''
		);

		return is_string( $rendered ) ? $rendered : '';
	}

	/**
	 * Sanitize inline span classes and remove the editor-only marker.
	 */
	public static function sanitize_inline_classes( $value ): string {
		$classes = self::sanitize_classes( $value );
		if ( '' === $classes ) {
			return '';
		}

		$classes = array_diff( preg_split( '/\s+/', $classes ) ?: array(), array( 'uet-inline-class', 'uet-letter' ) );
		return implode( ' ', $classes );
	}

	/**
	 * Sanitize the private ID that associates generated letter spans with a parent.
	 */
	public static function sanitize_letter_group_id( $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		return substr( preg_replace( '/[^a-z0-9_-]/i', '', trim( $value ) ) ?: '', 0, 64 );
	}

	/**
	 * Sanitize the accessible label stored on a generated letter group.
	 */
	public static function sanitize_letter_label( $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$value = sanitize_text_field( $value );
		return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, 500 ) : substr( $value, 0, 500 );
	}

	/**
	 * Sanitize a space-separated CSS class list.
	 */
	public static function sanitize_classes( $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		$classes = preg_split( '/\s+/', trim( $value ) );

		if ( ! is_array( $classes ) ) {
			return '';
		}

		$classes = array_filter( array_map( 'sanitize_html_class', $classes ) );
		$classes = array_values( array_unique( $classes ) );

		return implode( ' ', $classes );
	}

	/**
	 * Add editorial title values to Etch post dynamic data.
	 *
	 * Available in templates as:
	 * - {this.editorial_title}
	 * - {this.editorial_title_class}
	 *
	 * Available in loops using the loop item key, for example:
	 * - {item.editorial_title}
	 * - {item.editorial_title_class}
	 *
	 * @param array $data    Existing Etch post dynamic data.
	 * @param int   $post_id Current post ID.
	 * @return array
	 */
	public static function add_etch_dynamic_data( $data, $post_id ): array {
		if ( ! is_array( $data ) ) {
			$data = array();
		}

		$post = get_post( (int) $post_id );

		if ( ! $post instanceof WP_Post ) {
			return $data;
		}

		$data['editorial_title']       = uplink_get_editorial_title( $post );
		$data['editorial_title_class'] = uplink_get_editorial_title_class( $post );

		return $data;
	}

	/**
	 * Register Uplink Editorial Title tags in the Bricks Post dynamic-data group.
	 *
	 * @param array $tags Existing Bricks dynamic tags.
	 * @return array
	 */
	public static function register_bricks_dynamic_tags( $tags ): array {
		if ( ! is_array( $tags ) ) {
			$tags = array();
		}

		$tags[] = array(
			'name'  => '{uplink_editorial_title}',
			'label' => esc_html__( 'Editorial Title', 'uplink-editorial-title' ),
			'group' => 'Post',
		);

		$tags[] = array(
			'name'  => '{uplink_editorial_title_class}',
			'label' => esc_html__( 'Editorial Title Classes', 'uplink-editorial-title' ),
			'group' => 'Post',
		);

		return $tags;
	}

	/**
	 * Resolve a Uplink Editorial Title Bricks dynamic tag.
	 *
	 * @param mixed            $tag     Dynamic tag value.
	 * @param WP_Post|int|null $post    Current post or post ID.
	 * @param string           $context Bricks rendering context.
	 * @return mixed
	 */
	public static function render_bricks_dynamic_tag( $tag, $post, $context = 'text' ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed
		if ( ! is_string( $tag ) ) {
			return $tag;
		}

		$clean_tag = trim( $tag, '{}' );

		if ( 'uplink_editorial_title' === $clean_tag ) {
			return uplink_get_editorial_title( $post );
		}

		if ( 'uplink_editorial_title_class' === $clean_tag ) {
			return uplink_get_editorial_title_class( $post );
		}

		return $tag;
	}

	/**
	 * Replace Uplink Editorial Title tags when Bricks renders mixed content.
	 *
	 * @param mixed            $content Dynamic content string.
	 * @param WP_Post|int|null $post    Current post or post ID.
	 * @param string           $context Bricks rendering context.
	 * @return mixed
	 */
	public static function render_bricks_dynamic_content( $content, $post, $context = 'text' ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed
		if ( ! is_string( $content ) ) {
			return $content;
		}

		if ( false === strpos( $content, '{uplink_editorial_title' ) ) {
			return $content;
		}

		$replacements = array(
			'{uplink_editorial_title}'       => uplink_get_editorial_title( $post ),
			'{uplink_editorial_title_class}' => uplink_get_editorial_title_class( $post ),
		);

		return strtr( $content, $replacements );
	}


	/**
	 * Register the dynamic Editorial Title block for core templates and patterns.
	 */
	public static function register_editorial_title_block(): void {
		$settings = self::get_settings();

		register_block_type(
			'uplink/editorial-title',
			array(
				'api_version'     => 3,
				'editor_script'   => 'uplink-editorial-title-editor',
				'render_callback' => array( __CLASS__, 'render_editorial_title_block' ),
				'uses_context'    => array( 'postId', 'postType' ),
				'attributes'      => array(
					'level'     => array(
						'type'    => 'number',
						'default' => $settings['default_block_level'],
					),
					'className' => array(
						'type' => 'string',
					),
					'anchor'    => array(
						'type' => 'string',
					),
				),
				'supports'        => array(
					'html'      => false,
					'className' => true,
					'anchor'    => true,
				),
			)
		);
	}

	/**
	 * Render the Editorial Title block using the current post context.
	 *
	 * @param array    $attributes Block attributes.
	 * @param string   $content    Saved block content (unused for dynamic block).
	 * @param WP_Block $block      Parsed block instance.
	 * @return string
	 */
	public static function render_editorial_title_block( array $attributes, string $content, WP_Block $block ): string { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed
		$post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : get_the_ID();
		$post    = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return '';
		}

		$settings      = self::get_settings();
		$default_level = $settings['default_block_level'];
		$level         = isset( $attributes['level'] ) ? (int) $attributes['level'] : $default_level;
		$level         = max( 0, min( 6, $level ) );
		$tag           = 0 === $level ? 'p' : 'h' . $level;

		$classes  = array( 'wp-block-uplink-editorial-title' );
		$defaults = $settings['default_classes'];
		$stored   = uplink_get_editorial_title_class( $post );

		if ( '' !== $defaults ) {
			$classes = array_merge( $classes, preg_split( '/\s+/', $defaults ) ?: array() );
		}

		if ( '' !== $stored ) {
			$classes = array_merge( $classes, preg_split( '/\s+/', $stored ) ?: array() );
		}

		$classes = array_values( array_unique( array_filter( array_map( 'sanitize_html_class', $classes ) ) ) );

		// Core block supports add block-level Additional CSS Classes and anchors.
		$wrapper_attributes = get_block_wrapper_attributes(
			array(
				'class' => implode( ' ', $classes ),
			)
		);

		return sprintf(
			'<%1$s %2$s>%3$s</%1$s>',
			$tag,
			$wrapper_attributes,
			uplink_get_editorial_title( $post )
		);
	}

	/**
	 * Load the block-editor interface.
	 */
	public static function enqueue_editor_assets(): void {
		$asset_url       = plugin_dir_url( __FILE__ ) . 'assets/';
		$settings        = self::get_settings();
		$definitions     = self::format_definitions();
		$allowed_formats = array();

		foreach ( $settings['formats'] as $tag ) {
			if ( isset( $definitions[ $tag ] ) ) {
				$allowed_formats[] = $definitions[ $tag ]['editor_format'];
			}
		}

		wp_enqueue_script(
			'uplink-editorial-title-editor',
			$asset_url . 'editor.js',
			array(
				'wp-block-editor',
				'wp-blocks',
				'wp-components',
				'wp-core-data',
				'wp-compose',
				'wp-data',
				'wp-editor',
				'wp-element',
				'wp-i18n',
				'wp-plugins',
				'wp-rich-text',
			),
			self::asset_version( 'assets/editor.js' ),
			true
		);

		wp_add_inline_script(
			'uplink-editorial-title-editor',
			'window.uplinkEditorialTitleSettings = ' . wp_json_encode(
				array(
					'enabledPostTypes'  => $settings['post_types'],
					'allowedFormats'    => $allowed_formats,
					'defaultBlockLevel' => $settings['default_block_level'],
					'defaultClasses'    => $settings['default_classes'],
				)
			) . ';',
			'before'
		);

		wp_enqueue_style(
			'uplink-editorial-title-editor',
			$asset_url . 'editor.css',
			array( 'wp-edit-blocks' ),
			self::asset_version( 'assets/editor.css' )
		);

		wp_set_script_translations(
			'uplink-editorial-title-editor',
			'uplink-editorial-title',
			plugin_dir_path( __FILE__ ) . 'languages'
		);
	}
}

/**
 * Return the safe editorial title, falling back to the canonical post title.
 *
 * @param int|WP_Post|null $post Post ID or object. Defaults to the current post.
 * @return string Safe HTML suitable for direct output.
 */
function uplink_get_editorial_title( $post = null ): string {
	$post = get_post( $post );

	if ( ! $post instanceof WP_Post ) {
		return '';
	}

	$editorial_title = get_post_meta( $post->ID, Uplink_Editorial_Title::META_TITLE, true );

	if ( is_string( $editorial_title ) && '' !== trim( $editorial_title ) ) {
		return Uplink_Editorial_Title::render_editorial_title_markup( $editorial_title );
	}

	return esc_html( get_the_title( $post ) );
}

/**
 * Return sanitized CSS classes assigned to the editorial title.
 *
 * @param int|WP_Post|null $post Post ID or object. Defaults to the current post.
 */
function uplink_get_editorial_title_class( $post = null ): string {
	$post = get_post( $post );

	if ( ! $post instanceof WP_Post ) {
		return '';
	}

	return Uplink_Editorial_Title::sanitize_classes(
		(string) get_post_meta( $post->ID, Uplink_Editorial_Title::META_CLASS, true )
	);
}

Uplink_Editorial_Title::init();
