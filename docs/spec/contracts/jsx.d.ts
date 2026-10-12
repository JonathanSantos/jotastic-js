/**
 * Contrato de `jotastic/jsx-runtime` (só tipos; `jsx: "preserve"` → o compilador consome o JSX).
 * Estrutura obrigatória; a tabela completa de atributos HTML/SVG deve ser adaptada de `dom-expressions` (Solid, MIT),
 * com as mudanças marcadas abaixo.
 */

declare global {
  namespace JSX {
    /** Valor que um componente/expressão pode produzir. Opaco para o dev; o compilador garante lazy. */
    type Element = Node | Element[] | string | number | boolean | null | undefined | (() => Element)

    /** Permite `async function Comp()` (TS 5.1+): componentes podem devolver Promise<Element>. */
    type ElementType = string | ((props: any) => Element | Promise<Element>)

    interface ElementChildrenAttribute { children: {} }
    interface ElementAttributesProperty { props: {} }

    /** Atributos aceitos em QUALQUER elemento ou componente. */
    interface IntrinsicAttributes {
      key?: string | number | bigint | boolean | symbol | null | undefined
    }

    // ── Eventos ──────────────────────────────────────────────────────────────
    /** `onClick` → click; `onClickCapture` → capture. `currentTarget` tipado pelo elemento. */
    type EventHandler<T, E extends Event> = (e: E & { currentTarget: T; target: globalThis.Element }) => unknown
    /** Nomes compostos no estilo React (o compilador minusculiza): dblclick → DblClick, keydown → KeyDown… */
    type CamelEventNames = {
      dblclick: 'DblClick'; keydown: 'KeyDown'; keyup: 'KeyUp'; keypress: 'KeyPress'
      mousedown: 'MouseDown'; mouseup: 'MouseUp'; mousemove: 'MouseMove'; mouseenter: 'MouseEnter'; mouseleave: 'MouseLeave'; mouseover: 'MouseOver'; mouseout: 'MouseOut'
      pointerdown: 'PointerDown'; pointerup: 'PointerUp'; pointermove: 'PointerMove'; pointerenter: 'PointerEnter'; pointerleave: 'PointerLeave'; pointercancel: 'PointerCancel'
      touchstart: 'TouchStart'; touchend: 'TouchEnd'; touchmove: 'TouchMove'; touchcancel: 'TouchCancel'
      focusin: 'FocusIn'; focusout: 'FocusOut'; contextmenu: 'ContextMenu'; dragstart: 'DragStart'; dragend: 'DragEnd'; dragenter: 'DragEnter'; dragleave: 'DragLeave'; dragover: 'DragOver'
      animationstart: 'AnimationStart'; animationend: 'AnimationEnd'; animationiteration: 'AnimationIteration'; transitionend: 'TransitionEnd'
      compositionstart: 'CompositionStart'; compositionend: 'CompositionEnd'; compositionupdate: 'CompositionUpdate'
      loadeddata: 'LoadedData'; loadedmetadata: 'LoadedMetadata'; canplay: 'CanPlay'; canplaythrough: 'CanPlayThrough'; timeupdate: 'TimeUpdate'; volumechange: 'VolumeChange'
      beforeinput: 'BeforeInput'; selectionchange: 'SelectionChange'; durationchange: 'DurationChange'; ratechange: 'RateChange'
    }
    type EventPropName<K extends string> = K extends keyof CamelEventNames ? CamelEventNames[K] : Capitalize<K>
    type EventAttributes<T> = {
      [K in keyof HTMLElementEventMap as `on${EventPropName<K>}` | `on${EventPropName<K>}Capture`]?: EventHandler<T, HTMLElementEventMap[K]>
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
      /** @deprecated use `class` */ className?: ClassValue
      style?: StyleValue
      innerHTML?: string
      textContent?: string
      hidden?: boolean
      // `data-*` e `aria-*` são aceitos via index signatures tipadas:
      [data: `data-${string}`]: string | number | boolean | null | undefined
      [aria: `aria-${string}`]: string | number | boolean | null | undefined
    }

    /**
     * Atributos HTML: nomes camelCase do React (`tabIndex`, `readOnly`, `maxLength`) E minúsculos do HTML (`tabindex`, `readonly`, `maxlength`).
     * O compilador normaliza. `for` em vez de `htmlFor` (aceito com aviso).
     */
    interface HTMLAttributes<T> extends DOMAttributes<T> {
      id?: string; title?: string | number; lang?: string; dir?: 'ltr' | 'rtl' | 'auto'
      tabIndex?: number; tabindex?: number
      role?: string; draggable?: boolean; contentEditable?: boolean | 'inherit'; spellcheck?: boolean
      accessKey?: string; autocapitalize?: string; translate?: 'yes' | 'no'
      // … (tabela completa gerada a partir de dom-expressions)
    }
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
      type?: 'text' | 'password' | 'email' | 'number' | 'range' | 'checkbox' | 'radio' | 'file' | 'date' | 'time' | 'datetime-local' | 'month' | 'week' | 'color' | 'search' | 'tel' | 'url' | 'hidden' | 'submit' | 'reset' | 'button' | (string & {})
      /** two-way quando sem handler e expressão atribuível (D31). `type="number"` → `number | null`. */
      value?: string | number | null | undefined
      checked?: boolean
      name?: string; placeholder?: string; disabled?: boolean; readOnly?: boolean; readonly?: boolean; required?: boolean
      min?: string | number; max?: string | number; step?: string | number; minLength?: number; maxLength?: number; pattern?: string
      autofocus?: boolean; autocomplete?: string; multiple?: boolean; accept?: string; form?: string; list?: string; size?: number
    }
    interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
      /** `string` ou, com `multiple`, `string[]` (two-way). */
      value?: string | string[] | null | undefined
      multiple?: boolean; name?: string; disabled?: boolean; required?: boolean; size?: number; autofocus?: boolean
    }
    interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
      value?: string | null | undefined; name?: string; placeholder?: string; rows?: number; cols?: number
      disabled?: boolean; readOnly?: boolean; required?: boolean; minLength?: number; maxLength?: number; autofocus?: boolean; wrap?: string
    }
    interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> { type?: 'submit' | 'reset' | 'button'; disabled?: boolean; name?: string; value?: string; form?: string; autofocus?: boolean }
    interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> { href?: string; target?: string; rel?: string; download?: string | boolean }
    interface FormHTMLAttributes<T> extends HTMLAttributes<T> { action?: string; method?: string; novalidate?: boolean; noValidate?: boolean; autocomplete?: string; enctype?: string }
    interface LabelHTMLAttributes<T> extends HTMLAttributes<T> { for?: string; /** @deprecated use `for` */ htmlFor?: string }
    interface ImgHTMLAttributes<T> extends HTMLAttributes<T> { src?: string; alt?: string | number; width?: number | string; height?: number | string; loading?: 'lazy' | 'eager'; decoding?: 'async' | 'sync' | 'auto'; srcset?: string; sizes?: string }
    interface DialogHTMLAttributes<T> extends HTMLAttributes<T> { open?: boolean }
    interface OptionHTMLAttributes<T> extends HTMLAttributes<T> { value?: string | number; selected?: boolean; disabled?: boolean; label?: string }
    interface SVGAttributes<T> extends DOMAttributes<T> { [attr: string]: any }

    interface IntrinsicElements {
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
      div: HTMLAttributes<HTMLDivElement>; span: HTMLAttributes<HTMLSpanElement>; p: HTMLAttributes<HTMLParagraphElement>
      h1: HTMLAttributes<HTMLHeadingElement>; h2: HTMLAttributes<HTMLHeadingElement>; h3: HTMLAttributes<HTMLHeadingElement>
      ul: HTMLAttributes<HTMLUListElement>; ol: HTMLAttributes<HTMLOListElement>; li: HTMLAttributes<HTMLLIElement>
      section: HTMLAttributes<HTMLElement>; article: HTMLAttributes<HTMLElement>; header: HTMLAttributes<HTMLElement>; footer: HTMLAttributes<HTMLElement>
      nav: HTMLAttributes<HTMLElement>; main: HTMLAttributes<HTMLElement>; aside: HTMLAttributes<HTMLElement>; small: HTMLAttributes<HTMLElement>
      fieldset: HTMLAttributes<HTMLFieldSetElement>; legend: HTMLAttributes<HTMLLegendElement>; code: HTMLAttributes<HTMLElement>; b: HTMLAttributes<HTMLElement>; strong: HTMLAttributes<HTMLElement>
      table: HTMLAttributes<HTMLTableElement>; thead: HTMLAttributes<HTMLElement>; tbody: HTMLAttributes<HTMLElement>; tr: HTMLAttributes<HTMLTableRowElement>; td: HTMLAttributes<HTMLTableCellElement>; th: HTMLAttributes<HTMLTableCellElement>
      canvas: HTMLAttributes<HTMLCanvasElement>; video: HTMLAttributes<HTMLVideoElement>; audio: HTMLAttributes<HTMLAudioElement>; iframe: HTMLAttributes<HTMLIFrameElement>
      svg: SVGAttributes<SVGSVGElement>; path: SVGAttributes<SVGPathElement>; circle: SVGAttributes<SVGCircleElement>; rect: SVGAttributes<SVGRectElement>; g: SVGAttributes<SVGGElement>; line: SVGAttributes<SVGLineElement>; text: SVGAttributes<SVGTextElement>
      // … todos os demais elementos HTML/SVG (gerar)
      [custom: `${string}-${string}`]: HTMLAttributes<HTMLElement> & Record<string, any>
    }
  }
}

/** Exportações do módulo (vazias: a transformação é do compilador, não há `jsx()` em runtime). */
export {}
