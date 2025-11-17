# TipTap Izzy Extension: Resizable Image

Resizable inline image node for TipTap v2 with eight resize handles, optional alignment menu, drag-and-drop, and sensible defaults via `.extend()`.

Demo: https://startinn.github.io/TipTap-Extension-Izzy-Resizable-Image/

Download: https://www.npmjs.com/package/tiptap-extension-izzy-resizable-image

## Features

- Inline resizable image with 8 handles (nw, n, ne, e, se, s, sw, w)
- Drag-and-drop repositioning using browser native drag
- Optional inline alignment menu (left, center, right, clear)
- Menu position configurable (`above` or `below`)
- Keeps aspect ratio while resizing
- Menu icons accept HTML strings (e.g., `<i class="...">`)
- Deselects image and hides UI when clicking outside

## Installation

This demo loads TipTap and the extension via ESM in the browser. Include `resizable-image.js` next to your HTML file and import it.

```html
<script type="module">
  import { Editor } from 'https://esm.sh/@tiptap/core@2';
  import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2';
  import { TiptapIzzyExtensionResizableImage } from './resizable-image.js';
  // ...
</script>
```

## Quick Start

```js
const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [StarterKit, TiptapIzzyExtensionResizableImage],
});

// Insert an image
editor.commands.insertResizableImage({ src: 'https://picsum.photos/300/200', width: 300, height: 200 });

// Align the selected image
editor.commands.setResizableImageAlignment('center');
```

### Using from npm (bundler)

```bash
npm install tiptap-extension-izzy-resizable-image @tiptap/core@^3 prosemirror-state
```

```js
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TiptapIzzyExtensionResizableImage } from 'tiptap-extension-izzy-resizable-image';

const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [StarterKit, TiptapIzzyExtensionResizableImage],
});
```

## Defaults via `.extend()`

You can set extension-wide defaults using `.extend()` to override `addOptions()`.

```js
const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [
    StarterKit,
    TiptapIzzyExtensionResizableImage.extend({
      addOptions() {
        return {
          height: 200,
          showAlignMenu: true,
          alignMenuPosition: 'below',
          alignMenuIcons: {
            left: '⟸',
            center: '⇔',
            right: '⟹',
            clear: 'x',
            preview: '🔍',
          },
          alignMenuButtonsHide: {
            // hide specific buttons if true
            // left: true,
            // right: true,
            // center: true,
            // clear: true,
            // preview: true,
            // size50: true,
            // size100: true,
          },
        };
      },
    }),
  ],
});

// With defaults set, you can omit height/menu attrs in insert:
editor.commands.insertResizableImage({ src: 'https://picsum.photos/300/200', width: 300 });
```

## Options (via `.extend()`)

- `height: number | null` — default height in pixels when node `height` attr is missing.
- `showAlignMenu: boolean` — whether the inline alignment menu is shown by default.
- `alignMenuPosition: 'above' | 'below'` — where the menu appears relative to the image.
- `alignMenuIcons: { left: string, center: string, right: string, clear: string, preview: string }` — HTML strings for menu buttons.
- `alignMenuButtonsHide: Record<string, boolean>` — hide specific buttons when `true` (supports `left`, `center`, `right`, `clear`, `preview`, `size50`, `size100`).

Reference:
- Defined in `resizable-image.js:387-394`
- Passed into the NodeView in `resizable-image.js:383-385`
- Used for insertion defaults in `resizable-image.js:402-414`

## Node Attributes

These can be set per-node, overriding options.

- `src: string` — image URL.
- `alt: string | null`
- `title: string | null`
- `width: number | null` — width in px.
- `height: number | null` — height in px.
- `id: string | null` — applied to the `<img>` element.
- `class: string | null` — applied to the `<img>` element.
- `align: 'left' | 'center' | 'right' | null` — alignment.
- `showAlignMenu: boolean | null` — show/hide menu per node.
- `alignMenuPosition: 'above' | 'below' | null`
- `iconLeft: string | null` — HTML or text for the left button.
- `iconCenter: string | null`
- `iconRight: string | null`
- `iconClear: string | null`
- `iconView: string | null` — HTML or text for the preview (lightbox) button.

Reference: `resizable-image.js:358-372`

## Commands

- `insertResizableImage({ src, alt, title, width, height, id, class })`
  - Inserts the resizable image node. Missing attrs fall back to options (e.g., `height`).
  - Reference: `resizable-image.js:398-416`

- `setResizableImageAlignment(align)`
  - Sets `align` on the currently selected image node.
  - Reference: `resizable-image.js:417-433`

## Keyboard Shortcuts

- `Enter` when an image is selected inserts a paragraph after it and moves the cursor there.
  - Reference: `resizable-image.js:412-431`

## Alignment Behavior

- Alignment is applied via `text-align` on the wrapper and toggling wrapper display.
- `left | center | right` set `text-align` accordingly; unaligned flows inline.
- Reference: `resizable-image.js:172-193`

## Resizing Behavior

- Eight handles adjust width/height; aspect ratio is preserved by default.
- Live preview updates `style.width`/`style.height`; final size is persisted to node attrs on pointerup.
- Reference: `resizable-image.js:195-271`

## Selection and Focus

- Menu and handles overlay appear only when the image node is selected.
- Clicking outside the image deselects it and hides menu/overlay.
- Reference: show/hide logic `resizable-image.js:302-321`, `resizable-image.js:324-334`; outside-click handling `resizable-image.js:456-483`.

## HTML Icons

- Menu buttons render using `innerHTML`, allowing HTML strings for icons or rich content.
- Use trusted sources; avoid unsanitized user input to prevent XSS.
- Reference: `resizable-image.js:120-123` and `resizable-image.js:291-294`.

## Demo Hooks

- Example toolbar integration in the demo (`index.html:37-73`) shows inserting images and alignment controls.

## Notes

- The extension is inline and draggable; selection toggles menu/handles.
- Deselecting removes the overlay/menu from the DOM to keep markup clean.
### Example with `id` and `class`

```js
editor.commands.insertResizableImage({
  src: 'https://picsum.photos/300/200',
  width: 300,
  id: 'hero-image',
  class: 'rounded shadow'
});
```
