(function (wp) {
	'use strict';

	if (!wp || !wp.i18n || !wp.element || !wp.plugins || !wp.editor || !wp.blockEditor || !wp.components || !wp.data || !wp.richText) {
		return;
	}

	const { __ } = wp.i18n;
	const { createElement: el, Fragment, useEffect, useRef, useState } = wp.element;
	const { registerPlugin } = wp.plugins;
	const { PluginDocumentSettingPanel } = wp.editor;
	const {
		BlockControls,
		ColorPalette,
		HeadingLevelDropdown,
		RichText,
		useBlockProps,
		useSettings,
	} = wp.blockEditor;
	const {
		BaseControl,
		Button,
		Popover,
		TabPanel,
		TextControl,
		Toolbar,
		ToolbarGroup,
		ToolbarButton,
	} = wp.components;
	const { useSelect, useDispatch, select } = wp.data;
	const {
		applyFormat: applyRichTextFormat,
		create,
		getActiveFormat,
		registerFormatType,
		toHTMLString,
		toggleFormat,
	} = wp.richText;

	const TITLE_META = 'uplink_editorial_title';
	const CLASS_META = 'uplink_editorial_title_class';
	const HIGHLIGHT_FORMAT = 'uplink-editorial-title/highlight';
	const HIGHLIGHT_ATTRIBUTE = 'data-uet-mark-color';
	const HIGHLIGHT_TEXT_ATTRIBUTE = 'data-uet-mark-text-color';
	const EDITOR_SETTINGS = window.uplinkEditorialTitleSettings || {};
	const ALL_FORMATS = [
		'core/bold',
		'core/italic',
		HIGHLIGHT_FORMAT,
		'core/strikethrough',
		'core/subscript',
		'core/superscript',
	];
	const FORMAT_TAGS = {
		'core/bold': 'STRONG',
		'core/italic': 'EM',
		[HIGHLIGHT_FORMAT]: 'MARK',
		'core/strikethrough': 'S',
		'core/subscript': 'SUB',
		'core/superscript': 'SUP',
	};
	const ALLOWED_FORMATS = Array.isArray(EDITOR_SETTINGS.allowedFormats)
		? ALL_FORMATS.filter((format) => EDITOR_SETTINGS.allowedFormats.includes(format))
		: ALL_FORMATS;
	const ALLOWED_TAGS = ALLOWED_FORMATS.map((format) => FORMAT_TAGS[format]);
	const ENABLED_POST_TYPES = Array.isArray(EDITOR_SETTINGS.enabledPostTypes)
		? EDITOR_SETTINGS.enabledPostTypes
		: null;
	const DEFAULT_BLOCK_LEVEL = Math.max(1, Math.min(6, Number(EDITOR_SETTINGS.defaultBlockLevel) || 2));
	const DEFAULT_CLASSES = typeof EDITOR_SETTINGS.defaultClasses === 'string'
		? EDITOR_SETTINGS.defaultClasses.trim()
		: '';

	const FORMAT_CONTROLS = [
		{ type: 'core/bold', label: __('Bold', 'uplink-editorial-title'), glyph: 'B', className: 'is-bold' },
		{ type: 'core/italic', label: __('Italic', 'uplink-editorial-title'), glyph: 'I', className: 'is-italic' },
		{ type: HIGHLIGHT_FORMAT, label: __('Highlight', 'uplink-editorial-title'), glyph: 'A', className: 'is-mark' },
		{ type: 'core/strikethrough', label: __('Strikethrough', 'uplink-editorial-title'), glyph: 'S', className: 'is-strike' },
		{ type: 'core/subscript', label: __('Subscript', 'uplink-editorial-title'), glyph: 'X₂', className: 'is-script' },
		{ type: 'core/superscript', label: __('Superscript', 'uplink-editorial-title'), glyph: 'X²', className: 'is-script' },
	].filter((control) => ALLOWED_FORMATS.includes(control.type));

	function registerEditorialFormats() {
		const richTextStore = select('core/rich-text');
		const existing = richTextStore && typeof richTextStore.getFormatType === 'function'
			? richTextStore.getFormatType(HIGHLIGHT_FORMAT)
			: null;

		if (!existing) {
			registerFormatType(HIGHLIGHT_FORMAT, {
				title: __('Highlight', 'uplink-editorial-title'),
				tagName: 'mark',
				className: null,
				attributes: {
					color: HIGHLIGHT_ATTRIBUTE,
					textColor: HIGHLIGHT_TEXT_ATTRIBUTE,
					style: 'style',
				},
			});
		}
	}

	function isSafeColorValue(value) {
		if (typeof value !== 'string') {
			return false;
		}

		const color = value.trim();
		if (!color || color.length > 300) {
			return false;
		}

		if (/[;{}<>"'\\@]/.test(color) || /\/\*|\*\/|url\s*\(|expression\s*\(|!important/i.test(color)) {
			return false;
		}

		if (!/^[a-z0-9#%.,()\/+\-*\s_]+$/i.test(color)) {
			return false;
		}

		let depth = 0;
		for (const character of color) {
			if (character === '(') depth += 1;
			if (character === ')') depth -= 1;
			if (depth < 0) return false;
		}
		if (depth !== 0) return false;

		if (window.CSS && typeof window.CSS.supports === 'function') {
			return window.CSS.supports('color', color);
		}

		return true;
	}

	function getMarkColors(element) {
		if (!element || element.tagName !== 'MARK') {
			return { backgroundColor: '', textColor: '' };
		}

		const storedBackgroundColor = element.getAttribute(HIGHLIGHT_ATTRIBUTE) || '';
		const storedTextColor = element.getAttribute(HIGHLIGHT_TEXT_ATTRIBUTE) || '';
		const inlineBackgroundColor = element.style.getPropertyValue('background-color') || '';
		const inlineTextColor = element.style.getPropertyValue('color') || '';
		let backgroundColor = storedBackgroundColor || inlineBackgroundColor;
		const textColor = storedTextColor || inlineTextColor;

		if (
			!storedBackgroundColor &&
			textColor &&
			/^(?:transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(backgroundColor)
		) {
			backgroundColor = '';
		}

		return {
			backgroundColor: isSafeColorValue(backgroundColor) ? backgroundColor.trim() : '',
			textColor: isSafeColorValue(textColor) ? textColor.trim() : '',
		};
	}

	function getMarkStyle(colors) {
		const styles = [];
		if (colors.backgroundColor) {
			styles.push('background-color:' + colors.backgroundColor);
		} else if (colors.textColor) {
			styles.push('background-color:transparent');
		}
		if (colors.textColor) {
			styles.push('color:' + colors.textColor);
		}
		return styles.join(';');
	}

	function getFormatColors(attributes) {
		const mark = document.createElement('mark');
		if (attributes && typeof attributes.color === 'string') {
			mark.setAttribute(HIGHLIGHT_ATTRIBUTE, attributes.color);
		}
		if (attributes && typeof attributes.textColor === 'string') {
			mark.setAttribute(HIGHLIGHT_TEXT_ATTRIBUTE, attributes.textColor);
		}
		if (attributes && typeof attributes.style === 'string') {
			mark.setAttribute('style', attributes.style);
		}
		return getMarkColors(mark);
	}

	function styleMarks(root) {
		if (!root) {
			return;
		}

		root.querySelectorAll('mark').forEach((mark) => {
			const colors = getMarkColors(mark);
			if (colors.backgroundColor) {
				mark.style.backgroundColor = colors.backgroundColor;
			} else if (colors.textColor) {
				mark.style.backgroundColor = 'transparent';
			} else {
				mark.style.removeProperty('background-color');
			}

			if (colors.textColor) {
				mark.style.color = colors.textColor;
			} else {
				mark.style.removeProperty('color');
			}
		});
	}

	/**
	 * Build preview HTML from the same strict element allowlist used server-side.
	 * Unknown elements are unwrapped. Only the validated mark color data attribute
	 * is retained, and it is converted to background-color for the editor preview.
	 */
	function sanitizeTitleHTML(html, includeStyles) {
		if (!html) {
			return '';
		}

		const source = document.createElement('template');
		const output = document.createElement('div');
		source.innerHTML = html;

		function copyNode(node, destination) {
			if (node.nodeType === Node.TEXT_NODE) {
				destination.appendChild(document.createTextNode(node.nodeValue || ''));
				return;
			}

			if (node.nodeType !== Node.ELEMENT_NODE) {
				return;
			}

			const allowed = ALLOWED_TAGS.includes(node.tagName);
			const nextDestination = allowed
				? destination.appendChild(document.createElement(node.tagName.toLowerCase()))
				: destination;

			if (allowed && node.tagName === 'MARK') {
				const colors = getMarkColors(node);
				if (colors.backgroundColor) {
					nextDestination.setAttribute(HIGHLIGHT_ATTRIBUTE, colors.backgroundColor);
				}
				if (colors.textColor) {
					nextDestination.setAttribute(HIGHLIGHT_TEXT_ATTRIBUTE, colors.textColor);
				}
				if (includeStyles) {
					const style = getMarkStyle(colors);
					if (style) {
						nextDestination.setAttribute('style', style);
					}
				}
			}

			Array.from(node.childNodes).forEach((child) => copyNode(child, nextDestination));
		}

		Array.from(source.content.childNodes).forEach((node) => copyNode(node, output));
		return output.innerHTML;
	}

	function sanitizePreviewHTML(html) {
		return sanitizeTitleHTML(html, true);
	}

	function sanitizeStorageHTML(html) {
		return sanitizeTitleHTML(html, false);
	}

	function findTextPosition(root, offset) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let remaining = Math.max(0, offset);
		let node = walker.nextNode();
		let lastNode = null;

		while (node) {
			lastNode = node;
			if (remaining <= node.nodeValue.length) {
				return { node, offset: remaining };
			}
			remaining -= node.nodeValue.length;
			node = walker.nextNode();
		}

		if (lastNode) {
			return { node: lastNode, offset: lastNode.nodeValue.length };
		}

		return { node: root, offset: 0 };
	}

	function restoreSelection(root, start, end) {
		if (!root || typeof start !== 'number' || typeof end !== 'number') {
			return;
		}

		const startPos = findTextPosition(root, start);
		const endPos = findTextPosition(root, end);
		const range = document.createRange();
		range.setStart(startPos.node, startPos.offset);
		range.setEnd(endPos.node, endPos.offset);

		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	}

	function EditorialTitlePanel() {
		const state = useSelect((selectStore) => {
			const editor = selectStore('core/editor');
			return {
				postType: editor.getCurrentPostType(),
				meta: editor.getEditedPostAttribute('meta') || {},
				canonicalTitle: editor.getEditedPostAttribute('title') || '',
			};
		}, []);

		const { editPost } = useDispatch('core/editor');
		const [isOpen, setIsOpen] = useState(false);
		const [popoverAnchor, setPopoverAnchor] = useState(null);
		const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
		const [colorAnchor, setColorAnchor] = useState(null);
		const [selectionState, setSelectionState] = useState({
			hasSelection: false,
			active: {},
			highlightBackgroundColor: '',
			highlightTextColor: '',
		});
		const editorShellRef = useRef(null);
		const savedRangeRef = useRef(null);
		const pendingSelectionRef = useRef(null);
		const [allowCustomColors = true, editorColors = []] = useSettings('color.custom', 'color.palette');

		if (!state.postType || (ENABLED_POST_TYPES && !ENABLED_POST_TYPES.includes(state.postType))) {
			return null;
		}

		const value = state.meta[TITLE_META] || '';
		const className = state.meta[CLASS_META] || '';
		const isFallback = !value;
		const previewHTML = value ? sanitizePreviewHTML(value) : '';
		const editorHTML = value ? sanitizePreviewHTML(value) : '';
		const fallbackTitle = state.canonicalTitle || __('Add editorial title…', 'uplink-editorial-title');

		function updateMeta(key, nextValue) {
			editPost({
				meta: {
					...state.meta,
					[key]: nextValue,
				},
			});
		}

		function getEditorElement() {
			return editorShellRef.current
				? editorShellRef.current.querySelector('[contenteditable="true"]')
				: null;
		}

		function captureSelection() {
			const editorElement = getEditorElement();
			const selection = window.getSelection();

			if (!editorElement || !selection || selection.rangeCount < 1) {
				return;
			}

			const range = selection.getRangeAt(0);
			if (!editorElement.contains(range.commonAncestorContainer)) {
				return;
			}

			savedRangeRef.current = range.cloneRange();

			let richValue;
			try {
				richValue = create({ element: editorElement, range });
			} catch (error) {
				return;
			}

			const active = {};
			let highlightBackgroundColor = '';
			let highlightTextColor = '';
			FORMAT_CONTROLS.forEach((control) => {
				const format = getActiveFormat(richValue, control.type);
				active[control.type] = Boolean(format);
				if (control.type === HIGHLIGHT_FORMAT && format && format.attributes) {
					const colors = getFormatColors(format.attributes);
					highlightBackgroundColor = colors.backgroundColor;
					highlightTextColor = colors.textColor;
				}
			});

			setSelectionState({
				hasSelection: !range.collapsed,
				active,
				highlightBackgroundColor,
				highlightTextColor,
			});
		}

		function commitRichValue(nextValue) {
			pendingSelectionRef.current = {
				start: nextValue.start,
				end: nextValue.end,
			};
			updateMeta(TITLE_META, sanitizeStorageHTML(toHTMLString({ value: nextValue })));
		}

		// Keep toolbar toggling distinct from wp.richText.applyFormat. Gutenberg
		// requires format.type to remain a registered format-name string.
		function toggleSelectedFormat(formatType) {
			const editorElement = getEditorElement();
			const range = savedRangeRef.current;

			if (!editorElement || !range || range.collapsed || !editorElement.contains(range.commonAncestorContainer)) {
				return;
			}

			try {
				const richValue = create({ element: editorElement, range });
				commitRichValue(toggleFormat(richValue, { type: formatType }));
			} catch (error) {
				return;
			}
		}

		function applyHighlightColor(attributeName, color) {
			const editorElement = getEditorElement();
			const range = savedRangeRef.current;

			if (!editorElement || !range || range.collapsed || !editorElement.contains(range.commonAncestorContainer)) {
				return;
			}

			const normalized = typeof color === 'string' ? color.trim() : '';
			if (normalized && !isSafeColorValue(normalized)) {
				return;
			}

			const attributes = {};
			const backgroundColor = attributeName === 'color'
				? normalized
				: selectionState.highlightBackgroundColor;
			const textColor = attributeName === 'textColor'
				? normalized
				: selectionState.highlightTextColor;

			if (backgroundColor) {
				attributes.color = backgroundColor;
			}
			if (textColor) {
				attributes.textColor = textColor;
			}
			attributes.style = getMarkStyle({ backgroundColor, textColor });

			if (!attributes.color && !attributes.textColor) {
				removeHighlight();
				return;
			}

			try {
				const richValue = create({ element: editorElement, range });
				const format = { type: HIGHLIGHT_FORMAT, attributes };
				commitRichValue(applyRichTextFormat(richValue, format));
			} catch (error) {
				return;
			}
		}

		function removeHighlight() {
			if (!selectionState.active[HIGHLIGHT_FORMAT]) {
				return;
			}
			toggleSelectedFormat(HIGHLIGHT_FORMAT);
		}

		function openHighlightPicker() {
			if (!selectionState.hasSelection) {
				return;
			}
			setColorPopoverOpen(true);
		}

		useEffect(() => {
			if (!isOpen) {
				return undefined;
			}

			let markObserver;
			const syncMarkStyles = () => styleMarks(getEditorElement());
			const frame = window.requestAnimationFrame(() => {
				const editorElement = getEditorElement();
				if (!editorElement) {
					return;
				}

				syncMarkStyles();
				markObserver = new window.MutationObserver(syncMarkStyles);
				markObserver.observe(editorElement, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: [HIGHLIGHT_ATTRIBUTE, HIGHLIGHT_TEXT_ATTRIBUTE],
				});
				editorElement.focus();

				if (pendingSelectionRef.current) {
					restoreSelection(
						editorElement,
						pendingSelectionRef.current.start,
						pendingSelectionRef.current.end
					);
					pendingSelectionRef.current = null;
					captureSelection();
				}
			});

			return () => {
				window.cancelAnimationFrame(frame);
				if (markObserver) {
					markObserver.disconnect();
				}
			};
		}, [isOpen, value]);

		function openEditor() {
			setIsOpen(true);
		}

		function closeEditor() {
			setColorPopoverOpen(false);
			setIsOpen(false);
			savedRangeRef.current = null;
			setSelectionState({
				hasSelection: false,
				active: {},
				highlightBackgroundColor: '',
				highlightTextColor: '',
			});
		}

		function resetTitle() {
			updateMeta(TITLE_META, '');
			closeEditor();
		}

		return el(
			PluginDocumentSettingPanel,
			{
				name: 'uplink-editorial-title',
				title: __('Editorial Title', 'uplink-editorial-title'),
				className: 'uplink-editorial-title-panel',
			},
			el(
				Fragment,
				null,
				el(
					BaseControl,
					{
						id: 'uplink-editorial-title-trigger',
						label: __('Display title', 'uplink-editorial-title'),
					},
					el(
						'button',
						{
							ref: setPopoverAnchor,
							type: 'button',
							className: 'uplink-editorial-title__trigger' + (isFallback ? ' is-fallback' : ''),
							onClick: openEditor,
							onFocus: openEditor,
							'aria-expanded': isOpen,
							'aria-haspopup': 'dialog',
							'aria-label': __('Edit editorial display title', 'uplink-editorial-title'),
						},
						value
							? el('span', {
								className: 'uplink-editorial-title__trigger-text',
								dangerouslySetInnerHTML: { __html: previewHTML },
							})
							: el('span', { className: 'uplink-editorial-title__trigger-text' }, fallbackTitle),
						isFallback
							? el('span', { className: 'uplink-editorial-title__trigger-status' }, __('Using post title', 'uplink-editorial-title'))
							: null
					),
					value
						? el(
							Button,
							{
								variant: 'link',
								isDestructive: true,
								className: 'uplink-editorial-title__reset',
								onClick: resetTitle,
							},
							__('Reset to post title', 'uplink-editorial-title')
						)
						: null,
					isOpen && popoverAnchor
						? el(
							Popover,
							{
								anchor: popoverAnchor,
								placement: 'left-start',
								offset: 10,
								shift: true,
								resize: false,
								expandOnMobile: true,
								focusOnMount: false,
								onClose: closeEditor,
								className: 'uplink-editorial-title__popover',
							},
							el(
								'div',
								{
									className: 'uplink-editorial-title__popover-inner',
									role: 'dialog',
									'aria-label': __('Editorial title editor', 'uplink-editorial-title'),
								},
								FORMAT_CONTROLS.length
									? el(
										Toolbar,
										{
											label: __('Editorial formatting', 'uplink-editorial-title'),
											className: 'uplink-editorial-title__toolbar',
										},
										el(
											ToolbarGroup,
											null,
											FORMAT_CONTROLS.map((control) => {
												const isHighlight = control.type === HIGHLIGHT_FORMAT;
												return el(
													ToolbarButton,
												{
													key: control.type,
													ref: isHighlight ? setColorAnchor : undefined,
													label: control.label,
													isActive: Boolean(selectionState.active[control.type]),
													disabled: !selectionState.hasSelection,
													onMouseDown: (event) => event.preventDefault(),
													onClick: isHighlight ? openHighlightPicker : () => toggleSelectedFormat(control.type),
													className: 'uplink-editorial-title__format-button ' + control.className,
													style: isHighlight ? { '--uet-highlight-indicator': selectionState.highlightBackgroundColor || '#f7d84a' } : undefined,
												},
												el('span', { 'aria-hidden': 'true' }, control.glyph)
												);
											})
										)
									)
									: null,
								colorPopoverOpen && colorAnchor
									? el(
										Popover,
										{
											anchor: colorAnchor,
											placement: 'bottom-start',
											offset: 8,
											shift: true,
											focusOnMount: 'firstElement',
											onClose: () => setColorPopoverOpen(false),
											className: 'uplink-editorial-title__color-popover',
										},
										el(
											'div',
											{
												className: 'uplink-editorial-title__color-panel',
												role: 'dialog',
												'aria-label': __('Highlight colors', 'uplink-editorial-title'),
											},
											el(
												TabPanel,
												{
													className: 'uplink-editorial-title__color-tabs',
													activeClass: 'is-active',
													initialTabName: 'textColor',
													tabs: [
														{ name: 'textColor', title: __('Text', 'uplink-editorial-title') },
														{ name: 'color', title: __('Background', 'uplink-editorial-title') },
													],
												},
												(tab) => el(ColorPalette, {
													colors: editorColors,
													value: tab.name === 'textColor'
														? selectionState.highlightTextColor || undefined
														: selectionState.highlightBackgroundColor || undefined,
													onChange: (nextColor) => applyHighlightColor(tab.name, nextColor),
													disableCustomColors: allowCustomColors === false,
													enableAlpha: true,
													clearable: true,
													__experimentalIsRenderedInSidebar: true,
													'aria-label': tab.title,
												})
											)
										)
									)
									: null,
								el(
									'div',
									{ className: 'uplink-editorial-title__editor', ref: editorShellRef },
									el(RichText, {
										identifier: 'uplink-editorial-title',
										tagName: 'div',
										className: 'uplink-editorial-title__rich-text',
										value: editorHTML,
										onChange: (nextValue) => updateMeta(TITLE_META, sanitizeStorageHTML(nextValue)),
										onMouseUp: captureSelection,
										onKeyUp: captureSelection,
										onSelect: captureSelection,
										onFocus: captureSelection,
										allowedFormats: ALLOWED_FORMATS,
										placeholder: state.canonicalTitle || __('Add editorial title…', 'uplink-editorial-title'),
										'aria-label': __('Editorial display title', 'uplink-editorial-title'),
									})
								)
							)
						)
						: null
				),
				el(TextControl, {
					label: __('CSS classes', 'uplink-editorial-title'),
					help: __('Optional, space-separated class names.', 'uplink-editorial-title'),
					value: className,
					onChange: (nextValue) => updateMeta(CLASS_META, nextValue),
					autoComplete: 'off',
					spellCheck: false,
				}),
				el(
					'p',
					{ className: 'uplink-editorial-title__canonical-note' },
					__('The standard WordPress title is not changed.', 'uplink-editorial-title')
				)
			)
		);
	}

	function registerEditorialTitleBlock() {
		if (!wp.blocks || typeof wp.blocks.registerBlockType !== 'function') {
			return;
		}

		wp.blocks.registerBlockType('uplink/editorial-title', {
			apiVersion: 3,
			title: __('Editorial Title', 'uplink-editorial-title'),
			description: __('Displays the editorial title for the current post, falling back to the standard post title.', 'uplink-editorial-title'),
			category: 'theme',
			icon: 'heading',
			usesContext: ['postId', 'postType'],
			attributes: {
				level: { type: 'number', default: DEFAULT_BLOCK_LEVEL },
			},
			supports: {
				html: false,
				className: true,
				anchor: true,
			},
			edit: function EditorialTitleBlockEdit(props) {
				const postId = props.context && props.context.postId;
				const postType = props.context && props.context.postType;
				const level = props.attributes.level || DEFAULT_BLOCK_LEVEL;
				const tagName = 'h' + Math.max(1, Math.min(6, Number(level) || DEFAULT_BLOCK_LEVEL));
				const previewClasses = ['uplink-editorial-title-block__preview', DEFAULT_CLASSES]
					.filter(Boolean)
					.join(' ');
				const blockProps = useBlockProps({ className: previewClasses });

				const record = useSelect((selectStore) => {
					if (!postId || !postType) {
						return null;
					}
					return selectStore('core').getEntityRecord('postType', postType, postId);
				}, [postId, postType]);

				let preview = '';
				if (record && record.meta && record.meta[TITLE_META]) {
					preview = sanitizePreviewHTML(record.meta[TITLE_META]);
				} else if (record && record.title) {
					preview = record.title.raw || record.title.rendered || '';
				}

				if (!preview) {
					preview = __('Editorial Title', 'uplink-editorial-title');
				}

				return el(
					Fragment,
					null,
					el(
						BlockControls,
						{ group: 'block' },
						el(HeadingLevelDropdown, {
							value: level,
							onChange: (nextLevel) => props.setAttributes({ level: Number(nextLevel) }),
						})
					),
					el(tagName, {
						...blockProps,
						dangerouslySetInnerHTML: { __html: preview },
					})
				);
			},
			save: function () {
				return null;
			},
		});
	}

	registerEditorialFormats();
	registerEditorialTitleBlock();

	registerPlugin('uplink-editorial-title', {
		render: EditorialTitlePanel,
		icon: 'editor-textcolor',
	});
})(window.wp);
