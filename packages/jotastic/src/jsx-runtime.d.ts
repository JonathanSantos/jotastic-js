/**
 * `jotastic/jsx-runtime` — só tipos. Contrato: `docs/spec/contracts/jsx.d.ts`.
 *
 * Com `"jsx": "preserve"` + `"jsxImportSource": "jotastic"`, o TypeScript resolve este módulo e usa o namespace
 * `JSX` exportado dele para checar o TSX. O mesmo namespace é espelhado em `globalThis.JSX` para que o dev escreva
 * `JSX.Element` sem import (como nos exemplos da spec). Não há `jsx()` em runtime: quem consome o JSX é o compilador.
 */

type DOMElement = globalThis.Element

/** Tags HTML/SVG com tipagem explícita abaixo; as demais vêm de `HTMLElementTagNameMap`/`SVGElementTagNameMap`. */
type ExplicitTags =
  | 'a'
  | 'button'
  | 'dialog'
  | 'form'
  | 'img'
  | 'input'
  | 'label'
  | 'option'
  | 'select'
  | 'textarea'
  | 'div'
  | 'span'
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'li'
  | 'section'
  | 'article'
  | 'header'
  | 'footer'
  | 'nav'
  | 'main'
  | 'aside'
  | 'small'
  | 'fieldset'
  | 'legend'
  | 'code'
  | 'b'
  | 'strong'
  | 'table'
  | 'thead'
  | 'tbody'
  | 'tr'
  | 'td'
  | 'th'
  | 'canvas'
  | 'video'
  | 'audio'
  | 'iframe'
  | 'svg'
  | 'path'
  | 'circle'
  | 'rect'
  | 'g'
  | 'line'
  | 'text'

type OtherHTMLTags = {
  [K in Exclude<keyof HTMLElementTagNameMap, ExplicitTags>]: JSX.HTMLAttributes<HTMLElementTagNameMap[K]>
}
type OtherSVGTags = {
  [K in Exclude<keyof SVGElementTagNameMap, ExplicitTags | keyof HTMLElementTagNameMap>]: JSX.SVGAttributes<
    SVGElementTagNameMap[K]
  >
}

/**
 * Nome React (camelCase) dos eventos nativos compostos: `keydown` → `KeyDown` (`onKeyDown`), `dblclick` → `DblClick`.
 * Eventos de uma palavra só usam `Capitalize` (`click` → `onClick`). O compilador mapeia de volta para minúsculas.
 */
interface CamelEventNames {
  animationcancel: 'AnimationCancel'
  animationend: 'AnimationEnd'
  animationiteration: 'AnimationIteration'
  animationstart: 'AnimationStart'
  auxclick: 'AuxClick'
  beforeinput: 'BeforeInput'
  beforematch: 'BeforeMatch'
  beforetoggle: 'BeforeToggle'
  canplay: 'CanPlay'
  canplaythrough: 'CanPlayThrough'
  compositionend: 'CompositionEnd'
  compositionstart: 'CompositionStart'
  compositionupdate: 'CompositionUpdate'
  contextlost: 'ContextLost'
  contextmenu: 'ContextMenu'
  contextrestored: 'ContextRestored'
  cuechange: 'CueChange'
  dblclick: 'DblClick'
  dragend: 'DragEnd'
  dragenter: 'DragEnter'
  dragleave: 'DragLeave'
  dragover: 'DragOver'
  dragstart: 'DragStart'
  durationchange: 'DurationChange'
  focusin: 'FocusIn'
  focusout: 'FocusOut'
  formdata: 'FormData'
  fullscreenchange: 'FullscreenChange'
  fullscreenerror: 'FullscreenError'
  gotpointercapture: 'GotPointerCapture'
  keydown: 'KeyDown'
  keypress: 'KeyPress'
  keyup: 'KeyUp'
  loadeddata: 'LoadedData'
  loadedmetadata: 'LoadedMetadata'
  loadstart: 'LoadStart'
  lostpointercapture: 'LostPointerCapture'
  mousedown: 'MouseDown'
  mouseenter: 'MouseEnter'
  mouseleave: 'MouseLeave'
  mousemove: 'MouseMove'
  mouseout: 'MouseOut'
  mouseover: 'MouseOver'
  mouseup: 'MouseUp'
  pointercancel: 'PointerCancel'
  pointerdown: 'PointerDown'
  pointerenter: 'PointerEnter'
  pointerleave: 'PointerLeave'
  pointermove: 'PointerMove'
  pointerout: 'PointerOut'
  pointerover: 'PointerOver'
  pointerrawupdate: 'PointerRawUpdate'
  pointerup: 'PointerUp'
  ratechange: 'RateChange'
  scrollend: 'ScrollEnd'
  securitypolicyviolation: 'SecurityPolicyViolation'
  selectionchange: 'SelectionChange'
  selectstart: 'SelectStart'
  slotchange: 'SlotChange'
  timeupdate: 'TimeUpdate'
  touchcancel: 'TouchCancel'
  touchend: 'TouchEnd'
  touchmove: 'TouchMove'
  touchstart: 'TouchStart'
  transitioncancel: 'TransitionCancel'
  transitionend: 'TransitionEnd'
  transitionrun: 'TransitionRun'
  transitionstart: 'TransitionStart'
  volumechange: 'VolumeChange'
}
type CamelEvent<K extends string> = K extends keyof CamelEventNames ? CamelEventNames[K] : Capitalize<K>

export namespace JSX {
  /** Valor que um componente/expressão pode produzir. Opaco para o dev; o compilador garante lazy. */
  /**
   * Ajuste em relação ao contrato (`Node[]` → `Element[]`): vários filhos mistos (`{count} (dobro: {double})`) e
   * `{items.map(...)}` produzem um array de `Element`, não só de `Node`.
   */
  type Element = Node | Element[] | string | number | boolean | null | undefined | (() => Element)

  /** Permite `async function Comp()` (TS 5.1+): componentes podem devolver Promise<Element>. */
  type ElementType = string | ((props: any) => Element | Promise<Element>)

  interface ElementChildrenAttribute {
    children: {}
  }
  interface ElementAttributesProperty {
    props: {}
  }

  /** Atributos aceitos em QUALQUER elemento ou componente. */
  interface IntrinsicAttributes {
    key?: string | number | bigint | boolean | symbol | null | undefined
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  /** `onClick` → click; `onClickCapture` → capture. `currentTarget` tipado pelo elemento. */
  type EventHandler<T, E extends Event> = (e: E & { currentTarget: T; target: DOMElement }) => unknown
  type EventAttributes<T> = {
    [K in keyof HTMLElementEventMap as `on${CamelEvent<K>}` | `on${CamelEvent<K>}Capture`]?: EventHandler<
      T,
      HTMLElementEventMap[K]
    >
  } & {
    /** Eventos customizados com nome exato: `on:item-selected`. */
    [K in `on:${string}`]?: EventHandler<T, CustomEvent>
  }

  // ── Atributos ────────────────────────────────────────────────────────────
  type ClassValue = string | null | undefined | false | Record<string, unknown> | ClassValue[]
  type StyleValue = string | null | undefined | Record<string, string | number | null | undefined>

  interface DOMAttributes<T> extends EventAttributes<T> {
    children?: Element
    ref?: T | ((el: T) => void)
    /** `class`, não `className` (aceito com aviso + autofix). */
    class?: ClassValue
    /** @deprecated use `class` */
    className?: ClassValue
    style?: StyleValue
    innerHTML?: string
    textContent?: string
    hidden?: boolean
    // `data-*` e `aria-*` são aceitos via index signatures tipadas:
    [data: `data-${string}`]: string | number | boolean | null | undefined
    [aria: `aria-${string}`]: string | number | boolean | null | undefined
  }

  /**
   * Atributos HTML: nomes camelCase do React (`tabIndex`, `readOnly`, `maxLength`) E minúsculos do HTML
   * (`tabindex`, `readonly`, `maxlength`). O compilador normaliza. `for` em vez de `htmlFor` (aceito com aviso).
   */
  interface HTMLAttributes<T> extends DOMAttributes<T> {
    id?: string
    title?: string
    lang?: string
    dir?: 'ltr' | 'rtl' | 'auto'
    tabIndex?: number
    tabindex?: number
    role?: string
    draggable?: boolean
    contentEditable?: boolean | 'inherit'
    spellcheck?: boolean
    accessKey?: string
    autocapitalize?: string
    translate?: 'yes' | 'no'
    // … (tabela completa gerada a partir de dom-expressions)
  }
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    type?:
      | 'text'
      | 'password'
      | 'email'
      | 'number'
      | 'range'
      | 'checkbox'
      | 'radio'
      | 'file'
      | 'date'
      | 'time'
      | 'datetime-local'
      | 'month'
      | 'week'
      | 'color'
      | 'search'
      | 'tel'
      | 'url'
      | 'hidden'
      | 'submit'
      | 'reset'
      | 'button'
      | (string & {})
    /** two-way quando sem handler e expressão atribuível (D31). `type="number"` → `number | null`. */
    value?: string | number | null | undefined
    checked?: boolean
    name?: string
    placeholder?: string
    disabled?: boolean
    readOnly?: boolean
    readonly?: boolean
    required?: boolean
    min?: string | number
    max?: string | number
    step?: string | number
    minLength?: number
    maxLength?: number
    pattern?: string
    autofocus?: boolean
    autocomplete?: string
    multiple?: boolean
    accept?: string
    form?: string
    list?: string
    size?: number
  }
  interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
    /** `string` ou, com `multiple`, `string[]` (two-way). */
    value?: string | string[] | null | undefined
    multiple?: boolean
    name?: string
    disabled?: boolean
    required?: boolean
    size?: number
    autofocus?: boolean
  }
  interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: string | null | undefined
    name?: string
    placeholder?: string
    rows?: number
    cols?: number
    disabled?: boolean
    readOnly?: boolean
    required?: boolean
    minLength?: number
    maxLength?: number
    autofocus?: boolean
    wrap?: string
  }
  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    type?: 'submit' | 'reset' | 'button'
    disabled?: boolean
    name?: string
    value?: string
    form?: string
    autofocus?: boolean
  }
  interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
    href?: string
    target?: string
    rel?: string
    download?: string | boolean
  }
  interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
    action?: string
    method?: string
    novalidate?: boolean
    noValidate?: boolean
    autocomplete?: string
    enctype?: string
  }
  interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
    for?: string
    /** @deprecated use `for` */
    htmlFor?: string
  }
  interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    src?: string
    alt?: string
    width?: number | string
    height?: number | string
    loading?: 'lazy' | 'eager'
    decoding?: 'async' | 'sync' | 'auto'
    srcset?: string
    sizes?: string
  }
  interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
    open?: boolean
  }
  interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: string | number
    selected?: boolean
    disabled?: boolean
    label?: string
  }
  interface SVGAttributes<T> extends DOMAttributes<T> {
    [attr: string]: any
  }

  interface IntrinsicElements extends OtherHTMLTags, OtherSVGTags {
    a: AnchorHTMLAttributes<HTMLAnchorElement>
    button: ButtonHTMLAttributes<HTMLButtonElement>
    dialog: DialogHTMLAttributes<HTMLDialogElement>
    form: FormHTMLAttributes<HTMLFormElement>
    img: ImgHTMLAttributes<HTMLImageElement>
    input: InputHTMLAttributes<HTMLInputElement>
    label: LabelHTMLAttributes<HTMLLabelElement>
    option: OptionHTMLAttributes<HTMLOptionElement>
    select: SelectHTMLAttributes<HTMLSelectElement>
    textarea: TextareaHTMLAttributes<HTMLTextAreaElement>
    div: HTMLAttributes<HTMLDivElement>
    span: HTMLAttributes<HTMLSpanElement>
    p: HTMLAttributes<HTMLParagraphElement>
    h1: HTMLAttributes<HTMLHeadingElement>
    h2: HTMLAttributes<HTMLHeadingElement>
    h3: HTMLAttributes<HTMLHeadingElement>
    ul: HTMLAttributes<HTMLUListElement>
    ol: HTMLAttributes<HTMLOListElement>
    li: HTMLAttributes<HTMLLIElement>
    section: HTMLAttributes<HTMLElement>
    article: HTMLAttributes<HTMLElement>
    header: HTMLAttributes<HTMLElement>
    footer: HTMLAttributes<HTMLElement>
    nav: HTMLAttributes<HTMLElement>
    main: HTMLAttributes<HTMLElement>
    aside: HTMLAttributes<HTMLElement>
    small: HTMLAttributes<HTMLElement>
    fieldset: HTMLAttributes<HTMLFieldSetElement>
    legend: HTMLAttributes<HTMLLegendElement>
    code: HTMLAttributes<HTMLElement>
    b: HTMLAttributes<HTMLElement>
    strong: HTMLAttributes<HTMLElement>
    table: HTMLAttributes<HTMLTableElement>
    thead: HTMLAttributes<HTMLElement>
    tbody: HTMLAttributes<HTMLElement>
    tr: HTMLAttributes<HTMLTableRowElement>
    td: HTMLAttributes<HTMLTableCellElement>
    th: HTMLAttributes<HTMLTableCellElement>
    canvas: HTMLAttributes<HTMLCanvasElement>
    video: HTMLAttributes<HTMLVideoElement>
    audio: HTMLAttributes<HTMLAudioElement>
    iframe: HTMLAttributes<HTMLIFrameElement>
    svg: SVGAttributes<SVGSVGElement>
    path: SVGAttributes<SVGPathElement>
    circle: SVGAttributes<SVGCircleElement>
    rect: SVGAttributes<SVGRectElement>
    g: SVGAttributes<SVGGElement>
    line: SVGAttributes<SVGLineElement>
    text: SVGAttributes<SVGTextElement>
    [custom: `${string}-${string}`]: HTMLAttributes<HTMLElement> & Record<string, any>
  }
}

import _JSX = JSX

declare global {
  /** Espelho de `JSX` (deste módulo) para uso sem import: `children: JSX.Element`. */
  namespace JSX {
    type Element = _JSX.Element
    type ElementType = _JSX.ElementType
    interface ElementChildrenAttribute extends _JSX.ElementChildrenAttribute {}
    interface ElementAttributesProperty extends _JSX.ElementAttributesProperty {}
    interface IntrinsicAttributes extends _JSX.IntrinsicAttributes {}
    type EventHandler<T, E extends Event> = _JSX.EventHandler<T, E>
    type EventAttributes<T> = _JSX.EventAttributes<T>
    type ClassValue = _JSX.ClassValue
    type StyleValue = _JSX.StyleValue
    interface DOMAttributes<T> extends _JSX.DOMAttributes<T> {}
    interface HTMLAttributes<T> extends _JSX.HTMLAttributes<T> {}
    interface InputHTMLAttributes<T> extends _JSX.InputHTMLAttributes<T> {}
    interface SelectHTMLAttributes<T> extends _JSX.SelectHTMLAttributes<T> {}
    interface TextareaHTMLAttributes<T> extends _JSX.TextareaHTMLAttributes<T> {}
    interface ButtonHTMLAttributes<T> extends _JSX.ButtonHTMLAttributes<T> {}
    interface AnchorHTMLAttributes<T> extends _JSX.AnchorHTMLAttributes<T> {}
    interface FormHTMLAttributes<T> extends _JSX.FormHTMLAttributes<T> {}
    interface LabelHTMLAttributes<T> extends _JSX.LabelHTMLAttributes<T> {}
    interface ImgHTMLAttributes<T> extends _JSX.ImgHTMLAttributes<T> {}
    interface DialogHTMLAttributes<T> extends _JSX.DialogHTMLAttributes<T> {}
    interface OptionHTMLAttributes<T> extends _JSX.OptionHTMLAttributes<T> {}
    interface SVGAttributes<T> extends _JSX.SVGAttributes<T> {}
    interface IntrinsicElements extends _JSX.IntrinsicElements {}
  }
}
