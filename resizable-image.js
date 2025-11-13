// Vanilla JS TipTap extension: tiptap-izzy-extension-resizable-image
// Provides resizable image with 8 handles and drag-and-drop repositioning

import { Node } from 'https://esm.sh/@tiptap/core@2';
import { NodeSelection, TextSelection, Plugin } from 'https://esm.sh/prosemirror-state@1';

// Helper to create a handle element
function createHandle(direction) {
  const handle = document.createElement('div');
  handle.className = `resize-handle handle-${direction}`;
  handle.dataset.direction = direction;
  handle.title = direction;
  return handle;
}

// Helper to map align to flex justification
function getJustifyContentForAlign(align) {
  switch (align) {
    case 'center': return 'center';
    case 'right': return 'flex-end';
    case 'left':
    default: return 'flex-start';
  }
}

class ResizableImageView {
  constructor(node, view, getPos, options) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.options = options || {};
    this.aspect = (node.attrs.height && node.attrs.width)
      ? node.attrs.width / node.attrs.height
      : null;

    // Top-level NodeView element acts as container
    this.dom = document.createElement('span');
    this.dom.className = 'tiptap-izzy-resizable-image';
    this.dom.style.display = ''; // inline by default
    this.dom.style.width = '';
    this.dom.setAttribute('draggable', 'true');

    // Wrapper container (non-flex; alignment handled via float or block center)
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'resizable-image-wrapper';
    this.wrapper.style.display = 'inline-block';
    this.wrapper.style.width = '';
    this.dom.appendChild(this.wrapper);

    // Inner container which holds the image and overlay
    this.inner = document.createElement('span');
    this.inner.className = 'resizable-image-inner';
    this.inner.style.position = 'relative';
    this.inner.style.display = 'inline-block';
    this.wrapper.appendChild(this.inner);

    // Actual image node
    this.img = document.createElement('img');
    this.img.src = node.attrs.src;
    this.img.alt = node.attrs.alt || '';
    this.img.style.display = 'block';
    this.img.style.userSelect = 'none';
    this.img.style.pointerEvents = 'none'; // allow handles to capture

    if (node.attrs.width) this.img.style.width = node.attrs.width + 'px';
    if (node.attrs.height) {
      this.img.style.height = node.attrs.height + 'px';
    } else if (this.options && this.options.height) {
      this.img.style.height = this.options.height + 'px';
    }

    // Initialize aspect ratio from natural image size if not provided
    this.img.addEventListener('load', () => {
      if (!this.aspect && this.img.naturalWidth && this.img.naturalHeight) {
        this.aspect = this.img.naturalWidth / this.img.naturalHeight;
      }
    });
    this.inner.appendChild(this.img);

    // Overlay for handles (positioned relative to inner container)
    this.overlay = document.createElement('div');
    this.overlay.className = 'resize-overlay';
    this.overlay.style.position = 'absolute';
    this.overlay.style.left = '0';
    this.overlay.style.top = '0';
    this.overlay.style.right = '0';
    this.overlay.style.bottom = '0';
    this.overlay.style.pointerEvents = 'none';
    // Do NOT append overlay by default; only when selected
    // this.inner.appendChild(this.overlay);

    // Create 8 handles: nw, n, ne, e, se, s, sw, w
    const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    this.handles = directions.map(dir => {
      const h = createHandle(dir);
      // handles need to capture pointer events
      h.style.pointerEvents = 'auto';
      h.addEventListener('pointerdown', this.onPointerDown.bind(this));
      this.overlay.appendChild(h);
      return h;
    });

    // Inline alignment menu (above/below)
    this.menu = document.createElement('div');
    this.menu.className = 'resizable-image-menu';
    this.menu.style.position = 'absolute';
    this.menu.style.left = '50%';
    this.menu.style.transform = 'translateX(-50%)';
    this.menu.style.pointerEvents = 'auto';
    this.menu.style.zIndex = '10';
    // Do NOT append menu by default; only when selected
    // this.inner.appendChild(this.menu);

    this.btnLeft = document.createElement('button');
    this.btnCenter = document.createElement('button');
    this.btnRight = document.createElement('button');
    this.btnClear = document.createElement('button');
    this.btnView = document.createElement('button');
    this.btnSize50 = document.createElement('button');
    this.btnSize100 = document.createElement('button');

    this.btnLeft.innerHTML = (node.attrs.iconLeft != null ? node.attrs.iconLeft : (this.options.alignMenuIcons?.left ?? '⟸'));
    this.btnCenter.innerHTML = (node.attrs.iconCenter != null ? node.attrs.iconCenter : (this.options.alignMenuIcons?.center ?? '⇔'));
    this.btnRight.innerHTML = (node.attrs.iconRight != null ? node.attrs.iconRight : (this.options.alignMenuIcons?.right ?? '⟹'));
    this.btnClear.innerHTML = (node.attrs.iconClear != null ? node.attrs.iconClear : (this.options.alignMenuIcons?.clear ?? 'x'));
    this.btnView.innerHTML = (node.attrs.iconView != null ? node.attrs.iconView : (this.options.alignMenuIcons?.preview ?? '🔍'));
    this.btnSize50.textContent = '50%';
    this.btnSize100.textContent = '100%';

    this.btnLeft.addEventListener('click', () => this.applyAlignAttr('left'));
    this.btnCenter.addEventListener('click', () => this.applyAlignAttr('center'));
    this.btnRight.addEventListener('click', () => this.applyAlignAttr('right'));
    this.btnClear.addEventListener('click', () => this.applyAlignAttr(null));
    this.btnView.addEventListener('click', () => this.openModal());
    this.btnSize50.addEventListener('click', () => this.applyResizePercent(0.5));
    this.btnSize100.addEventListener('click', () => this.applyResizePercent(1));

    const hidden = this.options.alignMenuButtonsHide || {};
    if (!hidden.left) this.menu.appendChild(this.btnLeft);
    if (!hidden.center) this.menu.appendChild(this.btnCenter);
    if (!hidden.right) this.menu.appendChild(this.btnRight);
    if (!hidden.clear) this.menu.appendChild(this.btnClear);
    if (!hidden.preview) this.menu.appendChild(this.btnView);
    if (!hidden.size50) this.menu.appendChild(this.btnSize50);
    if (!hidden.size100) this.menu.appendChild(this.btnSize100);
    

    this.updateMenuPosition(node.attrs.alignMenuPosition != null ? node.attrs.alignMenuPosition : (this.options && this.options.alignMenuPosition != null ? this.options.alignMenuPosition : 'below'));

    // Dragging support (ProseMirror handles draggable inline nodes)
    this.dom.addEventListener('dragstart', (e) => {
      // Allow browser native drag, letting ProseMirror manage drop
      // Provide minimal drag image to avoid large preview flicker
      const dragImg = document.createElement('canvas');
      dragImg.width = 1; dragImg.height = 1;
      e.dataTransfer.setDragImage(dragImg, 0, 0);
    });

    // Internal state for resizing
    this.dragging = null;

    // Initial alignment
    this.applyAlignment(node.attrs.align);
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.style.position = 'fixed';
    this.modalOverlay.style.inset = '0';
    this.modalOverlay.style.background = 'rgba(0,0,0,0.8)';
    this.modalOverlay.style.display = 'flex';
    this.modalOverlay.style.alignItems = 'center';
    this.modalOverlay.style.justifyContent = 'center';
    this.modalOverlay.style.zIndex = '9999';
    this.modalOverlay.style.cursor = 'zoom-out';
    this.modalImg = document.createElement('img');
    this.modalImg.src = this.img.src;
    this.modalImg.style.maxWidth = '90vw';
    this.modalImg.style.maxHeight = '90vh';
    this.modalImg.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
    const modalClose = document.createElement('button');
    modalClose.textContent = '✕';
    modalClose.style.position = 'absolute';
    modalClose.style.top = '16px';
    modalClose.style.right = '16px';
    modalClose.style.background = '#fff';
    modalClose.style.border = 'none';
    modalClose.style.borderRadius = '6px';
    modalClose.style.padding = '6px 8px';
    modalClose.style.cursor = 'pointer';
    this.modalOverlay.appendChild(this.modalImg);
    this.modalOverlay.appendChild(modalClose);
    this.modalOverlay.addEventListener('click', (ev) => {
      if (ev.target === this.modalOverlay) this.closeModal();
    });
    modalClose.addEventListener('click', () => this.closeModal());
  }

  updateMenuPosition(pos) {
    this.menu.classList.remove('menu-above', 'menu-below');
    if (pos === 'above') {
      this.menu.classList.add('menu-above');
      this.menu.style.top = '-32px';
      this.menu.style.bottom = '';
    } else {
      this.menu.classList.add('menu-below');
      this.menu.style.bottom = '-32px';
      this.menu.style.top = '';
    }
  }

  applyAlignAttr(align) {
    const pos = this.getPos();
    const tr = this.view.state.tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      align,
    });
    this.view.dispatch(tr);
  }

  applyAlignment(align) {
    // Reset styles
    this.inner.style.marginLeft = '';
    this.inner.style.marginRight = '';
    this.wrapper.style.textAlign = '';
    this.inner.style.display = 'inline-block';

    // Wrapper display: inline when no alignment to allow images side-by-side
    if (align === 'center' || align === 'left' || align === 'right') {
      this.wrapper.style.display = 'block';
    } else {
      this.wrapper.style.display = 'inline-block';
    }

    if (align === 'center') {
      this.wrapper.style.textAlign = 'center';
    } else if (align === 'right') {
      this.wrapper.style.textAlign = 'right';
    } else if (align === 'left') {
      this.wrapper.style.textAlign = 'left';
    } // else no text-align, inline flow
  }

  onPointerDown(event) {
    event.preventDefault();
    const direction = event.currentTarget.dataset.direction;
    const rect = this.img.getBoundingClientRect();
    this.dragging = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
      keepAspect: true,
    };

    // Attach move/up listeners to window to allow dragging outside node
    this._moveHandler = this.onPointerMove.bind(this);
    this._upHandler = this.onPointerUp.bind(this);
    window.addEventListener('pointermove', this._moveHandler);
    window.addEventListener('pointerup', this._upHandler, { once: true });
  }

  onPointerMove(event) {
    if (!this.dragging) return;
    const d = this.dragging;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;

    let newWidth = d.startWidth;
    let newHeight = d.startHeight;

    const dir = d.direction;
    const signX = (dir.includes('e') ? 1 : (dir.includes('w') ? -1 : 0));
    const signY = (dir.includes('s') ? 1 : (dir.includes('n') ? -1 : 0));

    // Apply deltas depending on handle direction
    if (signX !== 0) newWidth = Math.max(20, d.startWidth + dx * signX);
    if (signY !== 0) newHeight = Math.max(20, d.startHeight + dy * signY);

    if (d.keepAspect && this.aspect) {
      // Keep aspect by adjusting the dependent dimension
      if (signX !== 0 && signY === 0) {
        newHeight = Math.round(newWidth / this.aspect);
      } else if (signY !== 0 && signX === 0) {
        newWidth = Math.round(newHeight * this.aspect);
      } else {
        // if both, base on width
        newHeight = Math.round(newWidth / this.aspect);
      }
    }

    // Live preview
    this.img.style.width = newWidth + 'px';
    this.img.style.height = newHeight + 'px';
  }

  onPointerUp(event) {
    window.removeEventListener('pointermove', this._moveHandler);
    this._moveHandler = null;

    if (!this.dragging) return;

    const finalRect = this.img.getBoundingClientRect();
    const newWidth = Math.round(finalRect.width);
    const newHeight = Math.round(finalRect.height);

    this.dragging = null;

    // Persist new attrs to document
    const pos = this.getPos();
    const tr = this.view.state.tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      width: newWidth,
      height: newHeight,
    });
    this.view.dispatch(tr);
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    // update image attributes
    if (node.attrs.src !== this.img.src) this.img.src = node.attrs.src;
    this.img.alt = node.attrs.alt || '';
    if (node.attrs.width) this.img.style.width = node.attrs.width + 'px';
    else this.img.style.removeProperty('width');
    if (node.attrs.height) this.img.style.height = node.attrs.height + 'px';
    else this.img.style.removeProperty('height');

    // update alignment styles and menu
    this.applyAlignment(node.attrs.align);
    this.updateMenuPosition(node.attrs.alignMenuPosition != null ? node.attrs.alignMenuPosition : (this.options && this.options.alignMenuPosition != null ? this.options.alignMenuPosition : 'below'));
    this.btnLeft.innerHTML = (node.attrs.iconLeft != null ? node.attrs.iconLeft : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.left : '⟸'));
    this.btnCenter.innerHTML = (node.attrs.iconCenter != null ? node.attrs.iconCenter : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.center : '⇔'));
    this.btnRight.innerHTML = (node.attrs.iconRight != null ? node.attrs.iconRight : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.right : '⟹'));
    this.btnClear.innerHTML = (node.attrs.iconClear != null ? node.attrs.iconClear : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.clear : 'x'));
    if (this.btnView) this.btnView.innerHTML = (node.attrs.iconView != null ? node.attrs.iconView : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.preview : '🔍'));
    if (this.modalImg) this.modalImg.src = this.img.src;

    this.aspect = (node.attrs.height && node.attrs.width)
      ? node.attrs.width / node.attrs.height
      : this.aspect;
    return true;
  }

  selectNode() {
    this.dom.classList.add('selected');
    // Show menu only if attribute allows
    const showMenu = (this.node.attrs.showAlignMenu != null ? this.node.attrs.showAlignMenu : (this.options && this.options.showAlignMenu != null ? this.options.showAlignMenu : true));
    if (showMenu !== false) {
      this.dom.classList.add('show-menu');
      if (!this.inner.contains(this.menu)) {
        this.inner.appendChild(this.menu);
      }
      this.menu.style.display = '';
    } else {
      this.dom.classList.remove('show-menu');
      if (this.inner.contains(this.menu)) {
        this.inner.removeChild(this.menu);
      }
    }
    if (!this.inner.contains(this.overlay)) {
      this.inner.appendChild(this.overlay);
    }
    this.overlay.style.pointerEvents = 'auto';
  }

  deselectNode() {
    this.dom.classList.remove('selected');
    this.dom.classList.remove('show-menu');
    if (this.inner.contains(this.menu)) {
      this.inner.removeChild(this.menu);
    }
    if (this.inner.contains(this.overlay)) {
      this.inner.removeChild(this.overlay);
    }
    this.overlay.style.pointerEvents = 'none';
  }

  destroy() {
    window.removeEventListener('pointermove', this._moveHandler);
    window.removeEventListener('pointerup', this._upHandler);
    if (this.modalOverlay && this.modalOverlay.parentNode) this.modalOverlay.parentNode.removeChild(this.modalOverlay);
  }

  openModal() {
    if (!this.modalOverlay.parentNode) document.body.appendChild(this.modalOverlay);
  }

  closeModal() {
    if (this.modalOverlay && this.modalOverlay.parentNode) this.modalOverlay.parentNode.removeChild(this.modalOverlay);
  }

  stopEvent(event) {
    // Prevent ProseMirror from handling events from handles or menu
    return (
      (event.target.classList && event.target.classList.contains('resize-handle')) ||
      (this.menu && this.menu.contains(event.target))
    );
  }

  
}

export const TiptapIzzyExtensionResizableImage = Node.create({
  name: 'tiptap-izzy-extension-resizable-image',
  inline: true,
  group: 'inline',
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
      align: { default: 'left' },
      showAlignMenu: { default: null },
      alignMenuPosition: { default: null },
      iconLeft: { default: null },
      iconCenter: { default: null },
      iconRight: { default: null },
      iconClear: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', HTMLAttributes];
  },

  addNodeView() {
    return ({ node, view, getPos }) => new ResizableImageView(node, view, getPos, this.options);
  },

  addOptions() {
    return {
      height: null,
      showAlignMenu: true,
      alignMenuPosition: 'below',
      alignMenuIcons: { left: '⟸', center: '⇔', right: '⟹', clear: 'x' },
    };
  },

  addCommands() {
    return {
      insertResizableImage:
        ({ src, alt, title, width, height }) => ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src,
              alt,
              title,
              width,
              height: height != null ? height : this.options.height,
              showAlignMenu: this.options.showAlignMenu,
              alignMenuPosition: this.options.alignMenuPosition,
              iconLeft: this.options.alignMenuIcons?.left,
              iconCenter: this.options.alignMenuIcons?.center,
              iconRight: this.options.alignMenuIcons?.right,
              iconClear: this.options.alignMenuIcons?.clear,
            },
          });
        },
      setResizableImageAlignment:
        (align) => ({ editor }) => {
          // Only apply when the selected node is this image type
          const { state } = editor;
          const sel = state.selection;
          if (sel instanceof NodeSelection && sel.node && sel.node.type.name === this.name) {
            const pos = sel.$from.pos;
            const tr = state.tr.setNodeMarkup(pos, null, {
              ...sel.node.attrs,
              align,
            });
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          }
          return false;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        if (selection instanceof NodeSelection && selection.node && selection.node.type.name === this.name) {
          const paragraph = state.schema.nodes.paragraph?.createAndFill();
          if (!paragraph) return false;
          const tr = state.tr.insert(selection.to, paragraph);
          // Place cursor inside the new paragraph
          const pos = tr.selection.$to.pos + 1; // inside paragraph
          const resolved = tr.doc.resolve(selection.to + 1);
          tr.setSelection(TextSelection.create(tr.doc, resolved.pos));
          editor.view.dispatch(tr.scrollIntoView());
          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const sel = view.state.selection;
              if (sel instanceof NodeSelection && sel.node && sel.node.type.name === this.name) {
                const nodeDOM = view.nodeDOM(sel.$from.pos);
                const target = event.target;
                if (nodeDOM && target && nodeDOM.contains(target)) {
                  return false;
                }
                const coords = { left: event.clientX, top: event.clientY };
                const found = view.posAtCoords(coords);
                if (found && typeof found.pos === 'number') {
                  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, found.pos));
                  view.dispatch(tr);
                  return true;
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
    this.applyResizePercent = (percent) => {
      const naturalW = this.img.naturalWidth || Math.round(this.img.getBoundingClientRect().width);
      const targetW = Math.max(20, Math.round(naturalW * percent));
      const targetH = this.aspect ? Math.round(targetW / this.aspect) : Math.round(this.img.getBoundingClientRect().height);
      const pos = this.getPos();
      const tr = this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, width: targetW, height: targetH });
      this.view.dispatch(tr);
    };
