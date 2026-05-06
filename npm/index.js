import { Node } from '@tiptap/core'
import { NodeSelection, TextSelection, Plugin } from 'prosemirror-state'

function createHandle(direction) {
  const handle = document.createElement('div')
  handle.className = `resize-handle handle-${direction}`
  handle.dataset.direction = direction
  handle.title = direction
  return handle
}

function applyDimensionStyle(el, property, value) {
  if (value == null || value === '') {
    el.style.removeProperty(property)
    return
  }

  if (typeof value === 'number') {
    el.style[property] = value + 'px'
    return
  }

  const raw = String(value).trim()
  if (!raw) {
    el.style.removeProperty(property)
    return
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    el.style[property] = raw + 'px'
    return
  }

  el.style[property] = raw
}

function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isWidth100Percent(value) {
  if (value == null) return false
  return String(value).trim() === '100%'
}

function isPercentWidth(value) {
  if (value == null) return false
  return /^\d+(\.\d+)?%$/.test(String(value).trim())
}

class ResizableImageView {
  constructor(node, view, getPos, options) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.options = options || {}
    const initialWidth = toFiniteNumber(node.attrs.width)
    const initialHeight = toFiniteNumber(node.attrs.height)
    this.aspect = (initialWidth && initialHeight) ? initialWidth / initialHeight : null

    this.dom = document.createElement('span')
    this.dom.className = 'tiptap-izzy-resizable-image'
    this.dom.style.display = ''
    this.dom.style.width = ''
    this.dom.setAttribute('draggable', 'true')

    this.wrapper = document.createElement('div')
    this.wrapper.className = 'resizable-image-wrapper'
    this.wrapper.style.display = 'inline-block'
    this.wrapper.style.width = ''
    this.dom.appendChild(this.wrapper)

    this.inner = document.createElement('span')
    this.inner.className = 'resizable-image-inner'
    this.inner.style.position = 'relative'
    this.inner.style.display = 'inline-block'
    this.wrapper.appendChild(this.inner)

    this.img = document.createElement('img')
    this.img.src = node.attrs.src
    this.img.alt = node.attrs.alt || ''
    this.img.style.display = 'block'
    this.img.style.userSelect = 'none'
    this.img.style.pointerEvents = 'none'
    if (node.attrs.id) this.img.id = node.attrs.id
    if (node.attrs.class) this.img.className = node.attrs.class
    this.applyWidthLayout(node.attrs.width)
    if (node.attrs.height) {
      applyDimensionStyle(this.img, 'height', node.attrs.height)
    } else if (this.options && this.options.height) {
      applyDimensionStyle(this.img, 'height', this.options.height)
    }
    this.img.addEventListener('load', () => {
      if (!this.aspect && this.img.naturalWidth && this.img.naturalHeight) {
        this.aspect = this.img.naturalWidth / this.img.naturalHeight
      }
      this.applyInitialFitIfNeeded()
    })
    this.inner.appendChild(this.img)

    this.overlay = document.createElement('div')
    this.overlay.className = 'resize-overlay'
    this.overlay.style.position = 'absolute'
    this.overlay.style.left = '0'
    this.overlay.style.top = '0'
    this.overlay.style.right = '0'
    this.overlay.style.bottom = '0'
    this.overlay.style.pointerEvents = 'none'

    const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
    this.handles = directions.map(dir => {
      const h = createHandle(dir)
      h.style.pointerEvents = 'auto'
      h.addEventListener('pointerdown', this.onPointerDown.bind(this))
      this.overlay.appendChild(h)
      return h
    })

    this.menu = document.createElement('div')
    this.menu.className = 'resizable-image-menu'
    this.menu.style.position = 'absolute'
    this.menu.style.left = '50%'
    this.menu.style.transform = 'translateX(-50%)'
    this.menu.style.pointerEvents = 'auto'
    this.menu.style.zIndex = '10'

    this.btnLeft = document.createElement('button')
    this.btnCenter = document.createElement('button')
    this.btnRight = document.createElement('button')
    this.btnClear = document.createElement('button')
    this.btnView = document.createElement('button')
    this.btnSize50 = document.createElement('button')
    this.btnSize100 = document.createElement('button')

    this.btnLeft.innerHTML = (node.attrs.iconLeft != null ? node.attrs.iconLeft : (this.options.alignMenuIcons?.left ?? '⟸'))
    this.btnCenter.innerHTML = (node.attrs.iconCenter != null ? node.attrs.iconCenter : (this.options.alignMenuIcons?.center ?? '⇔'))
    this.btnRight.innerHTML = (node.attrs.iconRight != null ? node.attrs.iconRight : (this.options.alignMenuIcons?.right ?? '⟹'))
    this.btnClear.innerHTML = (node.attrs.iconClear != null ? node.attrs.iconClear : (this.options.alignMenuIcons?.clear ?? 'x'))
    this.btnView.innerHTML = (node.attrs.iconView != null ? node.attrs.iconView : (this.options.alignMenuIcons?.preview ?? '🔍'))
    this.btnSize50.textContent = '50%'
    this.btnSize100.textContent = '100%'

    this.btnLeft.addEventListener('click', () => this.applyAlignAttr('left'))
    this.btnCenter.addEventListener('click', () => this.applyAlignAttr('center'))
    this.btnRight.addEventListener('click', () => this.applyAlignAttr('right'))
    this.btnClear.addEventListener('click', () => this.applyAlignAttr(null))
    this.btnView.addEventListener('click', () => this.openModal())
    this.btnSize50.addEventListener('click', () => this.applyResizePercent(0.5))
    this.btnSize100.addEventListener('click', () => this.applyResizePercent(1))

    // Button map for ordering
    const buttonMap = {
      'left': this.btnLeft,
      'center': this.btnCenter,
      'right': this.btnRight,
      'clear': this.btnClear,
      'preview': this.btnView,
      'size50': this.btnSize50,
      'size100': this.btnSize100,
    }

    // Append buttons in the order specified by alignMenuOrder
    const hidden = this.options.alignMenuButtonsHide || {}
    const order = this.options?.alignMenuOrder || ['left', 'center', 'right', 'clear', 'preview', 'size50', 'size100']
    order.forEach(btnName => {
      const btn = buttonMap[btnName]
      if (btn && !hidden[btnName]) {
        this.menu.appendChild(btn)
      }
    })

    const menuVerticalPos = node.attrs.alignMenuPosition != null ? node.attrs.alignMenuPosition : (this.options && this.options.alignMenuPosition != null ? this.options.alignMenuPosition : 'below')
    this.updateMenuPosition(menuVerticalPos, node.attrs.align)

    this.dom.addEventListener('dragstart', (e) => {
      const dragImg = document.createElement('canvas')
      dragImg.width = 1
      dragImg.height = 1
      e.dataTransfer.setDragImage(dragImg, 0, 0)
    })

    this.dragging = null
    this.applyAlignment(node.attrs.align)

    this.modalOverlay = document.createElement('div')
    this.modalOverlay.style.position = 'fixed'
    this.modalOverlay.style.inset = '0'
    this.modalOverlay.style.background = 'rgba(0,0,0,0.8)'
    this.modalOverlay.style.display = 'flex'
    this.modalOverlay.style.alignItems = 'center'
    this.modalOverlay.style.justifyContent = 'center'
    this.modalOverlay.style.zIndex = '9999'
    this.modalOverlay.style.cursor = 'zoom-out'
    this.modalImg = document.createElement('img')
    this.modalImg.src = this.img.src
    this.modalImg.style.maxWidth = '90vw'
    this.modalImg.style.maxHeight = '90vh'
    this.modalImg.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)'
    const modalClose = document.createElement('button')
    modalClose.textContent = '✕'
    modalClose.style.position = 'absolute'
    modalClose.style.top = '16px'
    modalClose.style.right = '16px'
    modalClose.style.background = '#fff'
    modalClose.style.border = 'none'
    modalClose.style.borderRadius = '6px'
    modalClose.style.padding = '6px 8px'
    modalClose.style.cursor = 'pointer'
    this.modalOverlay.appendChild(this.modalImg)
    this.modalOverlay.appendChild(modalClose)
    this.modalOverlay.addEventListener('click', (ev) => {
      if (ev.target === this.modalOverlay) this.closeModal()
    })
    modalClose.addEventListener('click', () => this.closeModal())

  }

  getEditorContentWidth() {
    const selector = this.options?.fitToContainerSelector
    const root = this.view?.dom || this.dom?.parentElement
    if (!root) return null

    if (selector) {
      const bySelector = root.closest?.(selector) || root.querySelector?.(selector)
      if (bySelector) {
        const w = Math.round(bySelector.getBoundingClientRect().width)
        if (w > 0) return w
      }
    }

    const tiptap = this.dom?.closest?.('.tiptap') || root.closest?.('.tiptap') || root.querySelector?.('.tiptap')
    if (tiptap) {
      const w = Math.round(tiptap.getBoundingClientRect().width)
      if (w > 0) return w
    }

    const rootWidth = Math.round(root.getBoundingClientRect().width)
    return rootWidth > 0 ? rootWidth : null
  }

  applyInitialFitIfNeeded() {
    if (!this.img) return

    const maxAllowedWidth = toFiniteNumber(this.options?.maxAllowedWidth)
    const shouldAutoFit = this.options?.autoFitWhenOversized !== false
    if (!shouldAutoFit && maxAllowedWidth == null) return

    const attrWidth = this.node?.attrs?.width
    if (isWidth100Percent(attrWidth)) return

    const containerWidth = this.getEditorContentWidth()
    if (!containerWidth) return

    let limitWidth = shouldAutoFit ? containerWidth : null
    if (maxAllowedWidth != null) {
      limitWidth = limitWidth == null ? maxAllowedWidth : Math.min(limitWidth, maxAllowedWidth)
    }
    if (limitWidth == null) return

    const currentWidth = toFiniteNumber(attrWidth) || this.img.naturalWidth || Math.round(this.img.getBoundingClientRect().width)
    if (!currentWidth) return

    if (currentWidth <= limitWidth) return

    applyDimensionStyle(this.img, 'width', '100%')
    applyDimensionStyle(this.img, 'height', 'auto')

    const pos = this.getPos()
    const tr = this.view.state.tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      width: '100%',
      height: 'auto',
    })
    this.view.dispatch(tr)
  }

  updateMenuPosition(verticalPos, align) {
    this.menu.classList.remove('menu-above', 'menu-below')
    if (verticalPos === 'above') {
      this.menu.classList.add('menu-above')
      this.menu.style.top = '-32px'
      this.menu.style.bottom = ''
    } else {
      this.menu.classList.add('menu-below')
      this.menu.style.bottom = '-32px'
      this.menu.style.top = ''
    }

    // Horizontal positioning based on image alignment
    this.menu.style.left = ''
    this.menu.style.right = ''
    this.menu.style.transform = ''
    if (align === 'right') {
      this.menu.style.right = '0px'
    } else if (align === 'center') {
      // Explicit center alignment
      this.menu.style.left = '50%'
      this.menu.style.transform = 'translateX(-50%)'
    } else {
      // left or default (no align)
      this.menu.style.left = '0px'
    }
  }

  applyAlignAttr(align) {
    const pos = this.getPos()
    const tr = this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, align })
    this.view.dispatch(tr)
  }

  applyAlignment(align) {
    this.inner.style.marginLeft = ''
    this.inner.style.marginRight = ''
    this.wrapper.style.textAlign = ''
    this.inner.style.display = 'inline-block'
    if (align === 'center' || align === 'left' || align === 'right') {
      this.wrapper.style.display = 'block'
    } else {
      this.wrapper.style.display = 'inline-block'
    }
    if (align === 'center') {
      this.wrapper.style.textAlign = 'center'
    } else if (align === 'right') {
      this.wrapper.style.textAlign = 'right'
    } else if (align === 'left') {
      this.wrapper.style.textAlign = 'left'
    }
  }

  applyWidthLayout(widthValue) {
    if (isPercentWidth(widthValue)) {
      applyDimensionStyle(this.inner, 'width', widthValue)
      applyDimensionStyle(this.img, 'width', '100%')
      return
    }

    this.inner.style.removeProperty('width')
    applyDimensionStyle(this.img, 'width', widthValue)
  }

  applyResizePercent(percent) {
    const percentValue = Math.round(Math.max(0.05, Math.min(1, percent)) * 100) + '%'
    const pos = this.getPos()
    const tr = this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, width: percentValue, height: 'auto' })
    this.view.dispatch(tr)
  }

  onPointerDown(event) {
    event.preventDefault()
    const direction = event.currentTarget.dataset.direction
    const rect = this.img.getBoundingClientRect()
    this.dragging = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
      keepAspect: true,
    }
    this._moveHandler = this.onPointerMove.bind(this)
    this._upHandler = this.onPointerUp.bind(this)
    window.addEventListener('pointermove', this._moveHandler)
    window.addEventListener('pointerup', this._upHandler, { once: true })
  }

  onPointerMove(event) {
    if (!this.dragging) return
    const d = this.dragging
    const dx = event.clientX - d.startX
    const dy = event.clientY - d.startY
    let newWidth = d.startWidth
    let newHeight = d.startHeight
    const dir = d.direction
    const signX = (dir.includes('e') ? 1 : (dir.includes('w') ? -1 : 0))
    const signY = (dir.includes('s') ? 1 : (dir.includes('n') ? -1 : 0))
    if (signX !== 0) newWidth = Math.max(20, d.startWidth + dx * signX)
    if (signY !== 0) newHeight = Math.max(20, d.startHeight + dy * signY)
    if (d.keepAspect && this.aspect) {
      if (signX !== 0 && signY === 0) {
        newHeight = Math.round(newWidth / this.aspect)
      } else if (signY !== 0 && signX === 0) {
        newWidth = Math.round(newHeight * this.aspect)
      } else {
        newHeight = Math.round(newWidth / this.aspect)
      }
    }
    this.inner.style.width = newWidth + 'px'
    this.img.style.width = newWidth + 'px'
    this.img.style.height = newHeight + 'px'
  }

  onPointerUp(event) {
    window.removeEventListener('pointermove', this._moveHandler)
    this._moveHandler = null
    if (!this.dragging) return
    const finalRect = this.img.getBoundingClientRect()
    const newWidth = Math.round(finalRect.width)
    const newHeight = Math.round(finalRect.height)
    const maxAllowedWidth = toFiniteNumber(this.options?.maxAllowedWidth)
    this.dragging = null
    const pos = this.getPos()
    if (maxAllowedWidth != null && newWidth > maxAllowedWidth) {
      const tr = this.view.state.tr.setNodeMarkup(pos, null, {
        ...this.node.attrs,
        width: '100%',
        height: 'auto',
      })
      this.view.dispatch(tr)
      return
    }

    const tr = this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, width: newWidth, height: newHeight })
    this.view.dispatch(tr)
  }

  update(node) {
    if (node.type !== this.node.type) return false
    this.node = node
    if (node.attrs.src !== this.img.src) this.img.src = node.attrs.src
    this.img.alt = node.attrs.alt || ''
    this.applyWidthLayout(node.attrs.width)
    applyDimensionStyle(this.img, 'height', node.attrs.height)
    this.applyAlignment(node.attrs.align)
    const menuVerticalPos = node.attrs.alignMenuPosition != null ? node.attrs.alignMenuPosition : (this.options && this.options.alignMenuPosition != null ? this.options.alignMenuPosition : 'below')
    this.updateMenuPosition(menuVerticalPos, node.attrs.align)
    this.btnLeft.innerHTML = (node.attrs.iconLeft != null ? node.attrs.iconLeft : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.left : '⟸'))
    this.btnCenter.innerHTML = (node.attrs.iconCenter != null ? node.attrs.iconCenter : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.center : '⇔'))
    this.btnRight.innerHTML = (node.attrs.iconRight != null ? node.attrs.iconRight : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.right : '⟹'))
    this.btnClear.innerHTML = (node.attrs.iconClear != null ? node.attrs.iconClear : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.clear : 'x'))
    if (this.btnView) this.btnView.innerHTML = (node.attrs.iconView != null ? node.attrs.iconView : (this.options && this.options.alignMenuIcons ? this.options.alignMenuIcons.preview : '🔍'))
    const widthNum = toFiniteNumber(node.attrs.width)
    const heightNum = toFiniteNumber(node.attrs.height)
    this.aspect = (widthNum && heightNum) ? widthNum / heightNum : this.aspect
    return true
  }

  selectNode() {
    this.dom.classList.add('selected')
    const showMenu = (this.node.attrs.showAlignMenu != null ? this.node.attrs.showAlignMenu : (this.options && this.options.showAlignMenu != null ? this.options.showAlignMenu : true))
    if (showMenu !== false) {
      this.dom.classList.add('show-menu')
      if (!this.inner.contains(this.menu)) {
        this.inner.appendChild(this.menu)
      }
      this.menu.style.display = ''
    } else {
      this.dom.classList.remove('show-menu')
      if (this.inner.contains(this.menu)) {
        this.inner.removeChild(this.menu)
      }
    }
    if (!this.inner.contains(this.overlay)) {
      this.inner.appendChild(this.overlay)
    }
    this.overlay.style.pointerEvents = 'auto'
  }

  deselectNode() {
    this.dom.classList.remove('selected')
    this.dom.classList.remove('show-menu')
    if (this.inner.contains(this.menu)) {
      this.inner.removeChild(this.menu)
    }
    if (this.inner.contains(this.overlay)) {
      this.inner.removeChild(this.overlay)
    }
    this.overlay.style.pointerEvents = 'none'
  }

  stopEvent(event) {
    return (
      (event.target.classList && event.target.classList.contains('resize-handle')) ||
      (this.menu && this.menu.contains(event.target))
    )
  }

  destroy() {
    window.removeEventListener('pointermove', this._moveHandler)
    window.removeEventListener('pointerup', this._upHandler)
    if (this.modalOverlay && this.modalOverlay.parentNode) this.modalOverlay.parentNode.removeChild(this.modalOverlay)
  }

  openModal() {
    if (!this.modalOverlay.parentNode) document.body.appendChild(this.modalOverlay)
  }

  closeModal() {
    if (this.modalOverlay && this.modalOverlay.parentNode) this.modalOverlay.parentNode.removeChild(this.modalOverlay)
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
      id: { default: null },
      class: { default: null },
      align: { default: null },
      showAlignMenu: { default: null },
      alignMenuPosition: { default: null },
      iconLeft: { default: null },
      iconCenter: { default: null },
      iconRight: { default: null },
      iconClear: { default: null },
      iconView: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', HTMLAttributes]
  },

  addNodeView() {
    return ({ node, view, getPos }) => new ResizableImageView(node, view, getPos, this.options)
  },

  addOptions() {
    return {
      height: null,
      showAlignMenu: true,
      alignMenuPosition: 'below',
      alignMenuIcons: { left: '⟸', center: '⇔', right: '⟹', clear: 'x', preview: '🔍' },
      alignMenuOrder: ['left', 'center', 'right', 'clear', 'preview', 'size50', 'size100'],
      alignMenuButtonsHide: {},
      fitToContainerSelector: '.tiptap',
      autoFitWhenOversized: true,
      maxAllowedWidth: null,
    }
  },

  addCommands() {
    return {
      insertResizableImage:
        ({ src, alt, title, width, height, id, class: className, iconView }) => ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src,
              alt,
              title,
              width,
              height: height != null ? height : this.options.height,
              id,
              class: className,
              showAlignMenu: this.options.showAlignMenu,
              alignMenuPosition: this.options.alignMenuPosition,
              iconLeft: this.options.alignMenuIcons?.left,
              iconCenter: this.options.alignMenuIcons?.center,
              iconRight: this.options.alignMenuIcons?.right,
              iconClear: this.options.alignMenuIcons?.clear,
              iconView: iconView != null ? iconView : this.options.alignMenuIcons?.preview,
            },
          })
        },
      setResizableImageAlignment:
        (align) => ({ editor }) => {
          const { state } = editor
          const sel = state.selection
          if (sel instanceof NodeSelection && sel.node && sel.node.type.name === this.name) {
            const pos = sel.$from.pos
            const tr = state.tr.setNodeMarkup(pos, null, { ...sel.node.attrs, align })
            editor.view.dispatch(tr.scrollIntoView())
            return true
          }
          return false
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        if (selection instanceof NodeSelection && selection.node && selection.node.type.name === this.name) {
          const paragraph = state.schema.nodes.paragraph?.createAndFill()
          if (!paragraph) return false
          const tr = state.tr.insert(selection.to, paragraph)
          const resolved = tr.doc.resolve(selection.to + 1)
          tr.setSelection(TextSelection.create(tr.doc, resolved.pos))
          editor.view.dispatch(tr.scrollIntoView())
          return true
        }
        return false
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const sel = view.state.selection
              if (sel instanceof NodeSelection && sel.node && sel.node.type.name === this.name) {
                const nodeDOM = view.nodeDOM(sel.$from.pos)
                const target = event.target
                if (nodeDOM && target && nodeDOM.contains(target)) {
                  return false
                }
                const coords = { left: event.clientX, top: event.clientY }
                const found = view.posAtCoords(coords)
                if (found && typeof found.pos === 'number') {
                  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, found.pos))
                  view.dispatch(tr)
                  return true
                }
              }
              return false
            },
          },
        },
        appendTransaction: (transactions, oldState, newState) => {
          const imgType = newState.schema.nodes.image
          const resizeType = newState.schema.nodes[this.name]
          if (!imgType || !resizeType) return null
          let tr = newState.tr
          let changed = false
          newState.doc.descendants((node, pos) => {
            if (node.type === imgType) {
              tr = tr.setNodeMarkup(pos, resizeType, {
                src: node.attrs.src,
                alt: node.attrs.alt,
                title: node.attrs.title,
                width: node.attrs.width,
                height: node.attrs.height ?? this.options.height,
                showAlignMenu: this.options.showAlignMenu,
                alignMenuPosition: this.options.alignMenuPosition,
                iconLeft: this.options.alignMenuIcons?.left,
                iconCenter: this.options.alignMenuIcons?.center,
                iconRight: this.options.alignMenuIcons?.right,
                iconClear: this.options.alignMenuIcons?.clear,
                iconView: this.options.alignMenuIcons?.preview,
              })
              changed = true
            }
          })
          return changed ? tr : null
        },
      }),
    ]
  },
})
