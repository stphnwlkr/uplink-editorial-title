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
		removeFormat,
		toHTMLString,
		toggleFormat,
	} = wp.richText;

	const TITLE_META = 'uplink_editorial_title';
	const CLASS_META = 'uplink_editorial_title_class';
	const HIGHLIGHT_FORMAT = 'uplink-editorial-title/highlight';
	const INLINE_CLASS_FORMAT = 'uplink-editorial-title/inline-class';
	const HIGHLIGHT_ATTRIBUTE = 'data-uet-mark-color';
	const HIGHLIGHT_TEXT_ATTRIBUTE = 'data-uet-mark-text-color';
	const INLINE_CLASS_ATTRIBUTE = 'data-uet-inline-class';
	const INLINE_CLASS_MARKER = 'uet-inline-class';
	const EDITOR_SETTINGS = window.uplinkEditorialTitleSettings || {};
	const ALL_FORMATS = [
		'core/bold',
		'core/italic',
		HIGHLIGHT_FORMAT,
		INLINE_CLASS_FORMAT,
		'core/strikethrough',
		'core/subscript',
		'core/superscript',
	];
	const FORMAT_TAGS = {
		'core/bold': 'STRONG',
		'core/italic': 'EM',
		[HIGHLIGHT_FORMAT]: 'MARK',
		[INLINE_CLASS_FORMAT]: 'SPAN',
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
	const configuredBlockLevel = Number(EDITOR_SETTINGS.defaultBlockLevel);
	const DEFAULT_BLOCK_LEVEL = Number.isInteger(configuredBlockLevel)
		? Math.max(0, Math.min(6, configuredBlockLevel))
		: 2;
	const DEFAULT_CLASSES = typeof EDITOR_SETTINGS.defaultClasses === 'string'
		? EDITOR_SETTINGS.defaultClasses.trim()
		: '';

	const FORMAT_CONTROLS = [
		{ type: 'core/bold', label: __('Bold', 'uplink-editorial-title'), glyph: 'B', className: 'is-bold' },
		{ type: 'core/italic', label: __('Italic', 'uplink-editorial-title'), glyph: 'I', className: 'is-italic' },
		{ type: HIGHLIGHT_FORMAT, label: __('Highlight', 'uplink-editorial-title'), glyph: 'A', className: 'is-mark' },
		{ type: INLINE_CLASS_FORMAT, label: __('Inline CSS class', 'uplink-editorial-title'), glyph: '<>', className: 'is-inline-class' },
		{ type: 'core/strikethrough', label: __('Strikethrough', 'uplink-editorial-title'), glyph: 'S', className: 'is-strike' },
		{ type: 'core/subscript', label: __('Subscript', 'uplink-editorial-title'), glyph: 'X₂', className: 'is-script' },
		{ type: 'core/superscript', label: __('Superscript', 'uplink-editorial-title'), glyph: 'X²', className: 'is-script' },
	].filter((control) => ALLOWED_FORMATS.includes(control.type));

	function registerEditorialFormats() {
		const richTextStore = select('core/rich-text');
		const existingHighlight = richTextStore && typeof richTextStore.getFormatType === 'function'
			? richTextStore.getFormatType(HIGHLIGHT_FORMAT)
			: null;

		if (!existingHighlight) {
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

		const existingInlineClass = richTextStore && typeof richTextStore.getFormatType === 'function'
			? richTextStore.getFormatType(INLINE_CLASS_FORMAT)
			: null;

		if (!existingInlineClass) {
			registerFormatType(INLINE_CLASS_FORMAT, {
				title: __('Inline CSS class', 'uplink-editorial-title'),
				tagName: 'span',
				className: INLINE_CLASS_MARKER,
				attributes: {
					inlineClass: INLINE_CLASS_ATTRIBUTE,
				},
			});
		}
	}

	function sanitizeClassList(value) {
		if (typeof value !== 'string') {
			return '';
		}

		const classes = value.trim().split(/\s+/).map((className) => className
			.replace(/%[a-f0-9]{2}/gi, '')
			.replace(/[^a-z0-9_-]/gi, '')
		).filter((className) => className && className !== INLINE_CLASS_MARKER);

		return Array.from(new Set(classes)).join(' ');
	}

	function isValidClassList(value) {
		if (typeof value !== 'string' || value.length > 500) {
			return false;
		}

		const classes = value.trim();
		return !classes || classes.split(/\s+/).every((className) => /^[a-z0-9_-]+$/i.test(className));
	}

	function getInlineClasses(element) {
		if (!element || element.tagName !== 'SPAN') {
			return '';
		}

		const storedClasses = element.getAttribute(INLINE_CLASS_ATTRIBUTE) || '';
		const visibleClasses = Array.from(element.classList)
			.filter((className) => className !== INLINE_CLASS_MARKER)
			.join(' ');

		return sanitizeClassList(storedClasses || visibleClasses);
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

	function colorToRgba(value) {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d', { willReadFrequently: true });

		if (!context) {
			return null;
		}

		context.clearRect(0, 0, 1, 1);
		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);
		const pixel = context.getImageData(0, 0, 1, 1).data;

		return {
			r: pixel[0],
			g: pixel[1],
			b: pixel[2],
			a: pixel[3] / 255,
		};
	}

	function compositeColors(foreground, background) {
		const alpha = foreground.a + background.a * (1 - foreground.a);
		if (!alpha) {
			return { r: 0, g: 0, b: 0, a: 0 };
		}

		return {
			r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
			g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
			b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
			a: alpha,
		};
	}

	function getElementBackground(element) {
		let background = { r: 0, g: 0, b: 0, a: 0 };
		let current = element;

		while (current && current.nodeType === Node.ELEMENT_NODE) {
			const layer = colorToRgba(window.getComputedStyle(current).backgroundColor);
			if (layer) {
				background = compositeColors(background, layer);
			}
			current = current.parentElement;
		}

		return compositeColors(background, { r: 255, g: 255, b: 255, a: 1 });
	}

	function getRelativeLuminance(color) {
		const channels = [color.r, color.g, color.b].map((channel) => {
			const value = channel / 255;
			return value <= 0.04045
				? value / 12.92
				: Math.pow((value + 0.055) / 1.055, 2.4);
		});

		return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
	}

	function getHighlightContrast(editorElement, backgroundColor, textColor) {
		if (!editorElement) {
			return null;
		}

		if (
			(backgroundColor && !isSafeColorValue(backgroundColor)) ||
			(textColor && !isSafeColorValue(textColor))
		) {
			return { ratio: null, level: 'unknown' };
		}

		const sample = document.createElement('mark');
		sample.textContent = 'Aa';
		sample.style.position = 'absolute';
		sample.style.visibility = 'hidden';
		sample.style.pointerEvents = 'none';
		if (backgroundColor) {
			sample.style.backgroundColor = backgroundColor;
		} else if (textColor) {
			sample.style.backgroundColor = 'transparent';
		}
		if (textColor) {
			sample.style.color = textColor;
		}

		editorElement.appendChild(sample);
		const computedStyle = window.getComputedStyle(sample);
		const foreground = colorToRgba(computedStyle.color);
		const highlightBackground = colorToRgba(computedStyle.backgroundColor);
		const editorBackground = getElementBackground(editorElement);
		sample.remove();

		if (!foreground || !highlightBackground) {
			return null;
		}

		const background = compositeColors(highlightBackground, editorBackground);
		const opaqueForeground = compositeColors(foreground, background);
		const foregroundLuminance = getRelativeLuminance(opaqueForeground);
		const backgroundLuminance = getRelativeLuminance(background);
		const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
			(Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

		return {
			ratio,
			level: ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : ratio >= 3 ? 'large' : 'fail',
		};
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
	 * Unknown elements are unwrapped. Mark colors and inline span classes are
	 * normalized before storage or preview.
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

			if (allowed && node.tagName === 'SPAN') {
				const classes = getInlineClasses(node);
				nextDestination.className = includeStyles && classes
					? INLINE_CLASS_MARKER + ' ' + classes
					: INLINE_CLASS_MARKER;
				if (classes) {
					nextDestination.setAttribute(INLINE_CLASS_ATTRIBUTE, classes);
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

	function plainTextToHTML(value) {
		const container = document.createElement('div');
		container.textContent = typeof value === 'string' ? value : '';
		return container.innerHTML;
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
		const [classPopoverOpen, setClassPopoverOpen] = useState(false);
		const [classAnchor, setClassAnchor] = useState(null);
		const [pendingBackgroundColor, setPendingBackgroundColor] = useState('');
		const [pendingTextColor, setPendingTextColor] = useState('');
		const [pendingInlineClass, setPendingInlineClass] = useState('');
		const [activeColorTab, setActiveColorTab] = useState('textColor');
		const [colorError, setColorError] = useState('');
		const [classError, setClassError] = useState('');
		const [contrastResult, setContrastResult] = useState(null);
		const [selectionState, setSelectionState] = useState({
			hasSelection: false,
			active: {},
			highlightBackgroundColor: '',
			highlightTextColor: '',
			inlineClass: '',
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
			let inlineClass = '';
			FORMAT_CONTROLS.forEach((control) => {
				const format = getActiveFormat(richValue, control.type);
				active[control.type] = Boolean(format);
				if (control.type === HIGHLIGHT_FORMAT && format && format.attributes) {
					const colors = getFormatColors(format.attributes);
					highlightBackgroundColor = colors.backgroundColor;
					highlightTextColor = colors.textColor;
				}
				if (control.type === INLINE_CLASS_FORMAT && format && format.attributes) {
					inlineClass = sanitizeClassList(format.attributes.inlineClass || '');
				}
			});

			setSelectionState({
				hasSelection: !range.collapsed,
				active,
				highlightBackgroundColor,
				highlightTextColor,
				inlineClass,
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

		function applyHighlightColors(backgroundColor, textColor) {
			const editorElement = getEditorElement();
			const range = savedRangeRef.current;

			if (!editorElement || !range || range.collapsed || !editorElement.contains(range.commonAncestorContainer)) {
				return;
			}

			const normalizedBackgroundColor = typeof backgroundColor === 'string' ? backgroundColor.trim() : '';
			const normalizedTextColor = typeof textColor === 'string' ? textColor.trim() : '';
			if (
				(normalizedBackgroundColor && !isSafeColorValue(normalizedBackgroundColor)) ||
				(normalizedTextColor && !isSafeColorValue(normalizedTextColor))
			) {
				return;
			}

			const attributes = {};
			if (normalizedBackgroundColor) {
				attributes.color = normalizedBackgroundColor;
			}
			if (normalizedTextColor) {
				attributes.textColor = normalizedTextColor;
			}
			attributes.style = getMarkStyle({
				backgroundColor: normalizedBackgroundColor,
				textColor: normalizedTextColor,
			});

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
			setPendingBackgroundColor(selectionState.highlightBackgroundColor || '');
			setPendingTextColor(selectionState.highlightTextColor || '');
			setActiveColorTab('textColor');
			setColorError('');
			setClassPopoverOpen(false);
			setColorPopoverOpen(true);
		}

		function openInlineClassEditor() {
			if (!selectionState.hasSelection) {
				return;
			}

			setPendingInlineClass(selectionState.inlineClass || '');
			setClassError('');
			setColorPopoverOpen(false);
			setClassPopoverOpen(true);
		}

		function applyPendingInlineClass() {
			const editorElement = getEditorElement();
			const range = savedRangeRef.current;
			const classes = pendingInlineClass.trim();

			if (!isValidClassList(classes)) {
				setClassError(__('Use letters, numbers, hyphens, and underscores only.', 'uplink-editorial-title'));
				return;
			}

			if (!editorElement || !range || range.collapsed || !editorElement.contains(range.commonAncestorContainer)) {
				return;
			}

			setClassError('');
			setClassPopoverOpen(false);

			try {
				const richValue = create({ element: editorElement, range });
				if (!classes) {
					commitRichValue(removeFormat(richValue, INLINE_CLASS_FORMAT));
					return;
				}

				commitRichValue(applyRichTextFormat(richValue, {
					type: INLINE_CLASS_FORMAT,
					attributes: { inlineClass: sanitizeClassList(classes) },
				}));
			} catch (error) {
				return;
			}
		}

		function clearPendingHighlightColor() {
			setColorError('');
			if (activeColorTab === 'textColor') {
				setPendingTextColor('');
			} else {
				setPendingBackgroundColor('');
			}
		}

		function applyPendingHighlightColors() {
			const backgroundColor = pendingBackgroundColor.trim();
			const textColor = pendingTextColor.trim();

			if (
				(backgroundColor && !isSafeColorValue(backgroundColor)) ||
				(textColor && !isSafeColorValue(textColor))
			) {
				setColorError(__('Enter a valid CSS color value.', 'uplink-editorial-title'));
				return;
			}

			setColorError('');
			setColorPopoverOpen(false);
			applyHighlightColors(backgroundColor, textColor);
		}

		useEffect(() => {
			if (!colorPopoverOpen) {
				setContrastResult(null);
				return undefined;
			}

			const frame = window.requestAnimationFrame(() => {
				setContrastResult(getHighlightContrast(
					getEditorElement(),
					pendingBackgroundColor.trim(),
					pendingTextColor.trim()
				));
			});

			return () => window.cancelAnimationFrame(frame);
		}, [colorPopoverOpen, pendingBackgroundColor, pendingTextColor]);

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
			setClassPopoverOpen(false);
			setIsOpen(false);
			savedRangeRef.current = null;
			setSelectionState({
				hasSelection: false,
				active: {},
				highlightBackgroundColor: '',
				highlightTextColor: '',
				inlineClass: '',
			});
		}

		function resetTitle() {
			updateMeta(TITLE_META, '');
			closeEditor();
		}

		function useCurrentTitle() {
			if (typeof state.canonicalTitle !== 'string' || !state.canonicalTitle.trim()) {
				return;
			}

			updateMeta(TITLE_META, plainTextToHTML(state.canonicalTitle));
			setIsOpen(true);
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
					isFallback
						? el(
							Button,
							{
								variant: 'link',
								className: 'uplink-editorial-title__action uplink-editorial-title__use-current',
								onClick: useCurrentTitle,
								disabled: typeof state.canonicalTitle !== 'string' || !state.canonicalTitle.trim(),
							},
							__('Use current title', 'uplink-editorial-title')
						)
						: el(
							Button,
							{
								variant: 'link',
								isDestructive: true,
								className: 'uplink-editorial-title__action uplink-editorial-title__reset',
								onClick: resetTitle,
							},
							__('Reset to post title', 'uplink-editorial-title')
						),
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
								onFocusOutside: () => {},
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
											{ style: { '--uet-format-count': FORMAT_CONTROLS.length } },
											FORMAT_CONTROLS.map((control) => {
												const isHighlight = control.type === HIGHLIGHT_FORMAT;
												const isInlineClass = control.type === INLINE_CLASS_FORMAT;
												return el(
													ToolbarButton,
													{
														key: control.type,
														ref: isHighlight ? setColorAnchor : isInlineClass ? setClassAnchor : undefined,
														label: control.label,
														isActive: Boolean(selectionState.active[control.type]),
														disabled: !selectionState.hasSelection,
														onMouseDown: (event) => event.preventDefault(),
														onClick: isHighlight
															? openHighlightPicker
															: isInlineClass
																? openInlineClassEditor
																: () => toggleSelectedFormat(control.type),
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
											onFocusOutside: () => {},
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
											el(Button, {
												icon: 'no-alt',
												label: __('Close color picker', 'uplink-editorial-title'),
												className: 'uplink-editorial-title__color-close',
												onClick: () => setColorPopoverOpen(false),
											}),
											el(
												TabPanel,
												{
													className: 'uplink-editorial-title__color-tabs',
													activeClass: 'is-active',
													initialTabName: 'textColor',
													onSelect: setActiveColorTab,
													tabs: [
														{ name: 'textColor', title: __('Text', 'uplink-editorial-title') },
														{ name: 'color', title: __('Background', 'uplink-editorial-title') },
													],
												},
												(tab) => {
													const isTextColor = tab.name === 'textColor';
													const pendingColor = isTextColor ? pendingTextColor : pendingBackgroundColor;

													return el(
														Fragment,
														null,
														el(ColorPalette, {
															colors: editorColors,
															value: pendingColor || undefined,
															onChange: (nextColor) => {
																setColorError('');
																if (isTextColor) {
																	setPendingTextColor(nextColor || '');
																} else {
																	setPendingBackgroundColor(nextColor || '');
																}
															},
															disableCustomColors: allowCustomColors === false,
															enableAlpha: true,
															clearable: false,
															__experimentalIsRenderedInSidebar: true,
															'aria-label': tab.title,
														}),
														el(
															'div',
															{ className: 'uplink-editorial-title__advanced-color' },
															el(TextControl, {
																label: __('CSS color value', 'uplink-editorial-title'),
																help: __('Accepts var(--token), color-mix(...), and other valid CSS colors.', 'uplink-editorial-title'),
																value: pendingColor,
																onChange: (nextColor) => {
																	setColorError('');
																	if (isTextColor) {
																		setPendingTextColor(nextColor);
																	} else {
																		setPendingBackgroundColor(nextColor);
																	}
																},
																placeholder: isTextColor ? 'var(--text-color)' : 'color-mix(in oklch, yellow 50%, transparent)',
																__nextHasNoMarginBottom: true,
															}),
															colorError
																? el('p', { className: 'uplink-editorial-title__color-error', role: 'alert' }, colorError)
																: null
														)
													);
												}
											),
											contrastResult
												? el(
													'div',
													{
														className: 'uplink-editorial-title__contrast is-' + contrastResult.level,
														role: 'status',
														'aria-live': 'polite',
													},
													contrastResult.ratio === null
														? __('Enter valid colors to check contrast.', 'uplink-editorial-title')
														: el(
															Fragment,
															null,
															el('strong', null, __('Contrast', 'uplink-editorial-title') + ' ' + contrastResult.ratio.toFixed(2) + ':1'),
															el(
																'span',
																null,
																contrastResult.level === 'aaa'
																	? __('Passes AAA.', 'uplink-editorial-title')
																	: contrastResult.level === 'aa'
																		? __('Passes AA.', 'uplink-editorial-title')
																		: contrastResult.level === 'large'
																			? __('Passes AA for large text only.', 'uplink-editorial-title')
																			: __('Fails AA.', 'uplink-editorial-title')
															)
														)
												)
												: null,
											el(
												'div',
												{ className: 'uplink-editorial-title__color-actions' },
												el(
													Button,
													{
														variant: 'secondary',
														onClick: clearPendingHighlightColor,
														disabled: activeColorTab === 'textColor'
															? !pendingTextColor
															: !pendingBackgroundColor,
													},
													__('Clear', 'uplink-editorial-title')
												),
												el(
													Button,
													{
														variant: 'primary',
														onClick: applyPendingHighlightColors,
													},
													__('Apply changes', 'uplink-editorial-title')
												)
											)
										)
									)
									: null,
								classPopoverOpen && classAnchor
									? el(
										Popover,
										{
											anchor: classAnchor,
											placement: 'bottom-start',
											offset: 8,
											shift: true,
											focusOnMount: 'firstElement',
											onFocusOutside: () => {},
											onClose: () => setClassPopoverOpen(false),
											className: 'uplink-editorial-title__class-popover',
										},
										el(
											'div',
											{
												className: 'uplink-editorial-title__class-panel',
												role: 'dialog',
												'aria-label': __('Inline CSS class', 'uplink-editorial-title'),
											},
											el(Button, {
												icon: 'no-alt',
												label: __('Close class editor', 'uplink-editorial-title'),
												className: 'uplink-editorial-title__class-close',
												onClick: () => setClassPopoverOpen(false),
											}),
											el(
												'div',
												{ className: 'uplink-editorial-title__class-body' },
												el('strong', { className: 'uplink-editorial-title__class-title' }, __('Inline CSS class', 'uplink-editorial-title')),
												el(TextControl, {
													label: __('CSS classes', 'uplink-editorial-title'),
													help: __('Separate multiple class names with spaces.', 'uplink-editorial-title'),
													value: pendingInlineClass,
													onChange: (nextClass) => {
														setClassError('');
														setPendingInlineClass(nextClass);
													},
													autoComplete: 'off',
													spellCheck: false,
													__nextHasNoMarginBottom: true,
												}),
												classError
													? el('p', { className: 'uplink-editorial-title__class-error', role: 'alert' }, classError)
													: null
											),
											el(
												'div',
												{ className: 'uplink-editorial-title__class-actions' },
												el(
													Button,
													{
														variant: 'secondary',
														onClick: () => {
															setClassError('');
															setPendingInlineClass('');
														},
														disabled: !pendingInlineClass,
													},
													__('Clear', 'uplink-editorial-title')
												),
												el(
													Button,
													{
														variant: 'primary',
														onClick: applyPendingInlineClass,
													},
													__('Apply changes', 'uplink-editorial-title')
												)
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
				const attributeLevel = Number(props.attributes.level);
				const level = Number.isInteger(attributeLevel)
					? Math.max(0, Math.min(6, attributeLevel))
					: DEFAULT_BLOCK_LEVEL;
				const tagName = level === 0 ? 'p' : 'h' + level;
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
						}),
						level !== 0
							? el(
								ToolbarGroup,
								null,
								el(ToolbarButton, {
									icon: 'editor-paragraph',
									label: __('Use paragraph', 'uplink-editorial-title'),
									onClick: () => props.setAttributes({ level: 0 }),
								})
							)
							: null
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
