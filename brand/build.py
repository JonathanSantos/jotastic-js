"""Gera os SVGs da marca Jotastic (claro/escuro). Uso: python3 brand/build.py"""
import pathlib

OUT = pathlib.Path(__file__).parent
INK, PAPER, CORAL, AMBER, MUTED = '#16131B', '#FBF7F2', '#FF5B3A', '#FFC94A', '#8C8592'
SANS = "ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

# Wordmark monolinha desenhado à mão (sem fonte): baseline y=100, x-height 44, traço 13.
# Os pingos do j e do i são os "jots": o sinal que muda.
WORD = '''
<g fill="none" stroke="{fg}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 44 V110 Q20 128 2 128"/>
  <circle cx="62" cy="72" r="28"/>
  <path d="M112 26 V86 Q112 100 126 100 H132 M100 48 H130"/>
  <circle cx="170" cy="72" r="28"/><path d="M198 44 V100"/>
  <path d="M258 52 Q252 44 238 44 Q218 44 218 58 Q218 70 238 72 Q260 74 260 87 Q260 100 238 100 Q222 100 216 92"/>
  <path d="M284 26 V86 Q284 100 298 100 H304 M272 48 H302"/>
  <path d="M326 44 V100"/>
  <path d="M390 50.6 A28 28 0 1 0 390 93.4"/>
</g>
<circle cx="20" cy="22" r="9" fill="{coral}"/>
<circle cx="326" cy="22" r="9" fill="{coral}"/>
'''

def word(fg):
    return WORD.format(fg=fg, coral=CORAL)

# Símbolo: o "j" com o pingo coral e três riscos âmbar (o flash de uma atualização granular).
def mark(bg, fg, size=128):
    return f'''<rect width="128" height="128" rx="30" fill="{bg}"/>
<g transform="translate(-8 0)"><path d="M70 52 V92 Q70 112 48 112" fill="none" stroke="{fg}" stroke-width="15" stroke-linecap="round"/>
<circle cx="70" cy="30" r="11" fill="{CORAL}"/>
<g stroke="{AMBER}" stroke-width="6" stroke-linecap="round">
  <path d="M88 16 L95 9"/><path d="M93 30 H103"/><path d="M88 44 L95 51"/>
</g></g>'''

def svg(w, h, body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'

def write(name, content):
    (OUT / name).write_text(content)

# ── símbolo e logo ──────────────────────────────────────────────────────────
write('mark.svg', svg(128, 128, mark(INK, PAPER), 'Jotastic'))
write('mark-light.svg', svg(128, 128, mark(PAPER, INK), 'Jotastic'))
for theme, fg, bg in (('light', INK, PAPER), ('dark', PAPER, INK)):
    body = f'<g transform="translate(0 4)">{mark(INK if theme == "light" else PAPER, PAPER if theme == "light" else INK)}</g>'
    body += f'<g transform="translate(160 6)">{word(fg)}</g>'
    write(f'logo-{theme}.svg', svg(580, 140, body, 'Jotastic'))

# ── banner ──────────────────────────────────────────────────────────────────
def banner(theme):
    dark = theme == 'dark'
    bg, fg, card = (INK, PAPER, '#221E29') if dark else (PAPER, INK, '#FFFFFF')
    sub = '#B9B2BF' if dark else '#5E5866'
    line = '#2E2936' if dark else '#ECE4DA'
    kw, st = ('#FF8A70', '#7EE0C3') if dark else ('#D9381A', '#0F8A68')
    code = [
        (f'<tspan fill="{kw}">export function</tspan> Counter() {{', 0),
        (f'<tspan fill="{kw}">let</tspan> count = <tspan fill="{st}">0</tspan>', 1),
        (f'<tspan fill="{kw}">const</tspan> double = count * <tspan fill="{st}">2</tspan>', 1),
        ('', 0),
        (f'<tspan fill="{kw}">return</tspan> (', 1),
        ('&lt;button onClick={() =&gt; count++}&gt;', 2),
        ('{count} × 2 = {double}', 3),
        ('&lt;/button&gt;', 2),
        (')', 1),
        ('}', 0),
    ]
    rows = ''.join(
        f'<text x="{40 + ind * 22}" y="{84 + i * 25}">{t}</text>' for i, (t, ind) in enumerate(code)
    )
    # Destaque: os dois nós que de fato mudam (flash âmbar), o resto parado.
    flash = f'''
<rect x="101" y="215" width="78" height="26" rx="6" fill="{AMBER}" fill-opacity="{0.22 if dark else 0.35}" stroke="{AMBER}" stroke-width="2"/>
<rect x="245" y="215" width="90" height="26" rx="6" fill="{AMBER}" fill-opacity="{0.22 if dark else 0.35}" stroke="{AMBER}" stroke-width="2"/>'''
    card_svg = f'''<g transform="translate(700 56)">
<rect width="500" height="330" rx="22" fill="{card}" stroke="{line}" stroke-width="2"/>
<circle cx="32" cy="30" r="6" fill="{CORAL}"/><circle cx="52" cy="30" r="6" fill="{AMBER}"/><circle cx="72" cy="30" r="6" fill="{line}"/>
<text x="470" y="35" text-anchor="end" font-family="{MONO}" font-size="14" fill="{sub}">Counter.tsx</text>
<g font-family="{MONO}" font-size="17" fill="{fg}">{rows}</g>{flash}
</g>
<g transform="translate(1046 404)" font-family="{SANS}" font-size="15" fill="{sub}">
<circle cx="-12" cy="-5" r="6" fill="{AMBER}"/><text>2 nós atualizados · 0 re-renders</text></g>'''
    body = f'''<rect width="1280" height="460" fill="{bg}"/>
<g opacity="{0.07 if dark else 0.09}" fill="{fg}">{''.join(f'<circle cx="{x}" cy="{y}" r="2"/>' for x in range(20, 680, 32) for y in range(20, 460, 32))}</g>
<g transform="translate(84 70) scale(1.12)">{word(fg)}</g>
<text x="82" y="290" font-family="{SANS}" font-size="34" font-weight="700" fill="{fg}">TSX puro. Sem hooks. Sem VDOM.</text>
<text x="82" y="334" font-family="{SANS}" font-size="21" fill="{sub}">O componente roda uma vez. O compilador gera a reatividade,</text>
<text x="82" y="364" font-family="{SANS}" font-size="21" fill="{sub}">e só o nó que mudou é tocado.</text>
{card_svg}'''
    return svg(1280, 460, body, 'Jotastic — TSX puro, sem hooks, sem VDOM')

for t in ('light', 'dark'):
    write(f'banner-{t}.svg', banner(t))

# ── diagrama: como funciona ────────────────────────────────────────────────
def how(theme):
    dark = theme == 'dark'
    bg, fg, card = (INK, PAPER, '#221E29') if dark else (PAPER, INK, '#FFFFFF')
    sub = '#B9B2BF' if dark else '#5E5866'
    line = '#3A3442' if dark else '#E2D9CE'

    def box(x, title, step, lines, mono=True):
        t = ''.join(
            f'<text x="{x + 24}" y="{122 + i * 25}" font-family="{MONO if mono else SANS}" font-size="15" fill="{c or fg}">{s}</text>'
            for i, (s, c) in enumerate(lines)
        )
        return f'''<rect x="{x}" y="40" width="340" height="250" rx="18" fill="{card}" stroke="{line}" stroke-width="2"/>
<circle cx="{x + 36}" cy="76" r="14" fill="{CORAL}"/><text x="{x + 36}" y="81" text-anchor="middle" font-family="{SANS}" font-size="14" font-weight="700" fill="{PAPER}">{step}</text>
<text x="{x + 60}" y="82" font-family="{SANS}" font-size="18" font-weight="700" fill="{fg}">{title}</text>{t}'''

    arrow = lambda x: f'<path d="M{x} 165 H{x + 44}" stroke="{CORAL}" stroke-width="4" stroke-linecap="round"/><path d="M{x + 34} 155 L{x + 46} 165 L{x + 34} 175" fill="none" stroke="{CORAL}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    a = box(20, 'Você escreve', 1, [
        ('let count = 0', None), ('const double = count * 2', None), ('', None),
        ('&lt;p&gt;{count} → {double}&lt;/p&gt;', None), ('onClick={() =&gt; count++}', None),
    ])
    b = box(424, 'O compilador gera', 2, [
        ('count = signal(0)', None), ('double = memo(…)', None), ('', None),
        ('text(_m0, () =&gt; count.get())', None), ('text(_m1, () =&gt; double.get())', None),
    ])
    nodes = ''
    for i, (lbl, hot) in enumerate((('&lt;section&gt;', False), ('&lt;h2&gt; Contador', False), ('&lt;p&gt; "5"', True), ('&lt;p&gt; "10"', True), ('&lt;button&gt; +', False))):
        y = 102 + i * 34
        fill = AMBER if hot else 'none'
        nodes += f'<rect x="{852 + (0 if i == 0 else 22)}" y="{y}" width="{276 - (0 if i == 0 else 22)}" height="26" rx="7" fill="{fill}" fill-opacity="{0.3 if hot else 0}" stroke="{AMBER if hot else line}" stroke-width="2"/>'
        nodes += f'<text x="{866 + (0 if i == 0 else 22)}" y="{y + 18}" font-family="{MONO}" font-size="14" fill="{fg}">{lbl}</text>'
    c = f'''<rect x="828" y="40" width="340" height="250" rx="18" fill="{card}" stroke="{line}" stroke-width="2"/>
<circle cx="864" cy="76" r="14" fill="{CORAL}"/><text x="864" y="81" text-anchor="middle" font-family="{SANS}" font-size="14" font-weight="700" fill="{PAPER}">3</text>
<text x="888" y="82" font-family="{SANS}" font-size="18" font-weight="700" fill="{fg}">O DOM recebe</text>{nodes}'''
    foot = f'<text x="594" y="330" text-anchor="middle" font-family="{SANS}" font-size="16" fill="{sub}">Clique: <tspan fill="{fg}" font-weight="700">count.set(5)</tspan> → só os dois nós de texto são escritos. <tspan fill="{fg}" font-weight="700">Counter()</tspan> não roda de novo.</text>'
    body = f'<rect width="1188" height="360" rx="0" fill="{bg}"/>{a}{arrow(368)}{b}{arrow(772)}{c}{foot}'
    return svg(1188, 360, body, 'Como o Jotastic funciona')

for t in ('light', 'dark'):
    write(f'how-it-works-{t}.svg', how(t))

# ── paleta ─────────────────────────────────────────────────────────────────
sw = [(INK, 'Ink', '#16131B', PAPER), (PAPER, 'Paper', '#FBF7F2', INK), (CORAL, 'Jot Coral', '#FF5B3A', PAPER), (AMBER, 'Flash Amber', '#FFC94A', INK), (MUTED, 'Graphite', '#8C8592', PAPER)]
body = ''.join(
    f'<g transform="translate({i * 172} 0)"><rect width="160" height="120" rx="16" fill="{c}" stroke="#E2D9CE" stroke-width="1.5"/>'
    f'<text x="16" y="84" font-family="{SANS}" font-size="16" font-weight="700" fill="{tc}">{n}</text>'
    f'<text x="16" y="104" font-family="{MONO}" font-size="13" fill="{tc}">{h}</text></g>'
    for i, (c, n, h, tc) in enumerate(sw)
)
write('palette.svg', svg(852, 120, body, 'Paleta Jotastic'))
print('ok')

# ═══ Diagramas da documentação ═════════════════════════════════════════════
# Mesmo vocabulário visual do banner e do how-it-works: cartões com raio 18, número coral, código em mono,
# âmbar = "o que mudou", coral = ação/fluxo, graphite = parado.

def theme_of(theme):
    dark = theme == 'dark'
    return dict(
        dark=dark,
        bg=INK if dark else PAPER,
        fg=PAPER if dark else INK,
        card='#221E29' if dark else '#FFFFFF',
        sub='#B9B2BF' if dark else '#5E5866',
        line='#3A3442' if dark else '#E2D9CE',
        soft='#2B2632' if dark else '#F4EEE6',
        kw='#FF8A70' if dark else '#D9381A',
        st='#7EE0C3' if dark else '#0F8A68',
        amber_fill=0.22 if dark else 0.35,
    )


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def T(x, y, s, c, size=15, mono=False, bold=False, anchor='start', raw=False, opacity=None):
    if mono and not raw and anchor == 'start' and s.startswith(' '):
        n = len(s) - len(s.lstrip(' '))
        x, s = x + n * size * 0.6, s.lstrip(' ')
    if mono:
        s = s.replace('  ', ' \u00a0')  # o SVG colapsa espaços em sequência
    w = ' font-weight="700"' if bold else ''
    a = f' text-anchor="{anchor}"' if anchor != 'start' else ''
    o = f' opacity="{opacity}"' if opacity is not None else ''
    return f'<text x="{x}" y="{y}" font-family="{MONO if mono else SANS}" font-size="{size}" fill="{c}"{w}{a}{o}>{s if raw else esc(s)}</text>'


def card(x, y, w, h, t, r=18, fill=None, stroke=None, dash=False, sw=2):
    d = ' stroke-dasharray="7 6"' if dash else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill or t["card"]}" stroke="{stroke or t["line"]}" stroke-width="{sw}"{d}/>'


def step(x, y, n, title, t):
    return (f'<circle cx="{x}" cy="{y}" r="14" fill="{CORAL}"/>'
            + T(x, y + 5, str(n), PAPER, 14, bold=True, anchor='middle')
            + T(x + 24, y + 6, title, t['fg'], 18, bold=True))


def chip(x, y, label, t, hot=False, w=None, cold=False, mono=True, size=13):
    w = w or (len(label) * 8 + 22)
    fill, op, stroke = (AMBER, t['amber_fill'], AMBER) if hot else ((t['soft'], 1, t['line']))
    if cold:
        fill, op, stroke = 'none', 1, t['line']
    return (f'<rect x="{x}" y="{y}" width="{w}" height="26" rx="13" fill="{fill}" fill-opacity="{op}" stroke="{stroke}" stroke-width="2"'
            + (' stroke-dasharray="5 4"' if cold else '') + '/>'
            + T(x + w / 2, y + 18, label, t['fg'] if not cold else t['sub'], size, mono=mono, anchor='middle'))


def arrow(x1, y1, x2, y2, color=CORAL, w=3, head=10, dash=False):
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    hx1, hy1 = x2 - head * math.cos(ang - 0.5), y2 - head * math.sin(ang - 0.5)
    hx2, hy2 = x2 - head * math.cos(ang + 0.5), y2 - head * math.sin(ang + 0.5)
    d = ' stroke-dasharray="6 6"' if dash else ''
    return (f'<path d="M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}" stroke="{color}" stroke-width="{w}" stroke-linecap="round"{d}/>'
            f'<path d="M{hx1:.1f} {hy1:.1f} L{x2:.1f} {y2:.1f} L{hx2:.1f} {hy2:.1f}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')


def curve(x1, y1, x2, y2, color, w=2.5, dash=False, bend=0.5):
    mx = x1 + (x2 - x1) * bend
    d = ' stroke-dasharray="6 6"' if dash else ''
    return f'<path d="M{x1} {y1} C{mx} {y1} {mx} {y2} {x2} {y2}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"{d}/>'


def flash(x, y, t, s=1.0):
    """Os três riscos âmbar do símbolo: 'isto foi atualizado'."""
    return (f'<g transform="translate({x} {y}) scale({s})" stroke="{AMBER}" stroke-width="4" stroke-linecap="round">'
            '<path d="M0 0 L5 -5"/><path d="M3 10 H11"/><path d="M0 20 L5 25"/></g>')


def doc_svg(w, h, body, title, t):
    return svg(w, h, f'<rect width="{w}" height="{h}" fill="{t["bg"]}"/>' + body, title)


# ── 1. Re-render × escrita por nó ──────────────────────────────────────────
def compare(theme):
    t = theme_of(theme)
    W, H = 1188, 430

    def tree(ox, nodes, edges):
        out = ''
        for a, b in edges:
            (x1, y1, *_), (x2, y2, *_) = nodes[a], nodes[b]
            out += f'<path d="M{ox + x1} {y1 + 15} V{(y1 + y2) / 2 + 15} H{ox + x2} V{y2 - 15 + 15}" fill="none" stroke="{t["line"]}" stroke-width="2"/>'
        for x, y, label, state in nodes:
            w = len(label) * 8.6 + 26
            out += f'<rect x="{ox + x - w / 2}" y="{y}" width="{w}" height="30" rx="9" fill="{t["card"]}"/>'
            if state == 'rerun':
                out += f'<rect x="{ox + x - w / 2}" y="{y}" width="{w}" height="30" rx="9" fill="{CORAL}" fill-opacity="{0.16 if t["dark"] else 0.12}" stroke="{CORAL}" stroke-width="2" stroke-dasharray="5 4"/>'
            elif state == 'hot':
                out += f'<rect x="{ox + x - w / 2}" y="{y}" width="{w}" height="30" rx="9" fill="{AMBER}" fill-opacity="{t["amber_fill"]}" stroke="{AMBER}" stroke-width="2"/>'
                out += flash(ox + x + w / 2 + 8, y + 3, t, 0.9)
            else:
                out += f'<rect x="{ox + x - w / 2}" y="{y}" width="{w}" height="30" rx="9" fill="{t["card"]}" stroke="{t["line"]}" stroke-width="2"/>'
            out += T(ox + x, y + 20, label, t['fg'], 14, mono=True, anchor='middle')
        return out

    shape = [(270, 112), (150, 182), (390, 182), (90, 252), (210, 252), (330, 252), (450, 252)]
    edges = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (2, 6)]
    left_nodes = [(*shape[i], l, 'rerun') for i, l in enumerate(['<Page>', '<Header>', '<Counter>', '<Logo>', '<Nav>', '<Label>', '<Button>'])]
    right_nodes = [(*shape[0], '<main>', ''), (*shape[1], '<header>', ''), (*shape[2], '<section>', ''),
                   (*shape[3], '<img>', ''), (*shape[4], '<nav>', ''), (*shape[5], '"6"', 'hot'), (*shape[6], '"12"', 'hot')]
    body = card(16, 20, 562, 390, t) + card(610, 20, 562, 390, t)
    body += T(44, 62, 'Re-render + VDOM', t['fg'], 19, bold=True) + T(44, 86, 'setState → o componente e os filhos rodam de novo', t['sub'], 14)
    body += tree(26, left_nodes, edges)
    body += T(44, 334, 'nova árvore virtual  →  diff  →  patch', t['sub'], 14, mono=True)
    body += chip(44, 356, '7 funções rodaram', t, w=170, mono=False, size=14) + chip(224, 356, 'diff de 7 nós', t, w=140, mono=False, size=14)
    body += f'<circle cx="638" cy="56" r="7" fill="{CORAL}"/>' + T(654, 62, 'Jotastic', t['fg'], 19, bold=True)
    body += T(638, 86, 'count = 6 → o binding escreve direto no nó de texto', t['sub'], 14)
    body += tree(620, right_nodes, edges)
    body += T(638, 334, 'text(_m0, () => count.get())  →  node.data = "6"', t['sub'], 14, mono=True)
    body += chip(638, 356, '0 componentes rodaram', t, w=200, mono=False, size=14) + chip(848, 356, '2 escritas no DOM', t, hot=True, w=170, mono=False, size=14)
    return doc_svg(W, H, body, 'Re-render com VDOM comparado com escrita direta por nó no Jotastic', t)


# ── 2. Pipeline do compilador ──────────────────────────────────────────────
def pipeline(theme):
    t = theme_of(theme)
    W, H = 1188, 470
    # '`' no início = linha em mono
    stages = [
        ('Counter.tsx', ['TSX válido', 'tsc, ESLint e editor', 'funcionam sem plugin']),
        ('parse', ['`@babel/parser', 'tipos removidos com', '`transform-typescript']),
        ('analyzer', ['classifica cada', 'declaração e emite', 'diagnósticos']),
        ('emit', ['`template() içado', 'bindings por nó', '`branches, list, slots']),
        ('saída', ['JS legível', '+ sourcemap', 'builds de dev e prod']),
    ]
    bw, gap, x0, y0 = 206, 26, 18, 40
    body = ''
    for i, (title, lines) in enumerate(stages):
        x = x0 + i * (bw + gap)
        hot = title == 'analyzer'
        body += card(x, y0, bw, 190, t, stroke=CORAL if hot else None)
        body += step(x + 30, y0 + 34, i + 1, title, t)
        for j, l in enumerate(lines):
            code = l.startswith('`')
            body += T(x + 20, y0 + 88 + j * 26, l.lstrip('`'), t['fg'] if j == 0 else t['sub'], 14 if code else 15, mono=code)
        if i < len(stages) - 1:
            body += arrow(x + bw + 3, y0 + 95, x + bw + gap - 3, y0 + 95)
    # Tipos que o analyzer atribui
    ax = x0 + 2 * (bw + gap)
    kinds = [('signal', 'let'), ('state', 'let objeto'), ('memo', 'const derivado'), ('resource', 'await'), ('effect', 'watch'), ('plain', 'resto')]
    body += f'<path d="M{ax + bw / 2} {y0 + 190} V{y0 + 222}" stroke="{t["line"]}" stroke-width="2"/>'
    body += card(178, 262, 832, 76, t, fill=t['soft'])
    body += T(202, 292, 'BindingKind', t['sub'], 13, mono=True)
    cx = 202
    for k, src in kinds:
        w = len(k) * 9 + 24
        body += chip(cx, 302, k, t, w=w, hot=k in ('signal', 'memo'))
        body += T(cx + w + 6, 320, src, t['sub'], 12)
        cx += w + len(src) * 6.6 + 22
    # Consumidores
    body += card(18, 368, 560, 84, t) + card(610, 368, 560, 84, t)
    body += f'<circle cx="44" cy="400" r="7" fill="{AMBER}"/>' + T(60, 405, '@jotastic/eslint-plugin', t['fg'], 16, mono=True, bold=True)
    body += T(44, 432, 'usa o mesmo analyzer: as regras do compilador e os autofixes no editor', t['sub'], 14)
    body += f'<circle cx="636" cy="400" r="7" fill="{AMBER}"/>' + T(652, 405, '@jotastic/vite', t['fg'], 16, mono=True, bold=True)
    body += T(636, 432, 'roda o compile(): overlay de erro, HMR que preserva stores, devtools', t['sub'], 14)
    return doc_svg(W, H, body, 'Pipeline do compilador: parse, analyzer, emit e saída; ESLint e Vite usam as mesmas peças', t)


# ── 3. Núcleo reativo push-pull ────────────────────────────────────────────
def reactive_graph(theme):
    t = theme_of(theme)
    W, H = 1188, 470
    cols = [(40, 'signal'), (330, 'memo'), (620, 'efeito de render'), (910, 'DOM')]
    body = ''
    for x, lbl in cols:
        body += T(x, 46, lbl.upper(), t['sub'], 12, bold=True)
    # estado → cor
    def node(x, y, label, state, w=240, note=None):
        col = {'dirty': CORAL, 'check': AMBER, 'clean': t['line']}[state]
        fill = {'dirty': CORAL, 'check': AMBER, 'clean': t['card']}[state]
        op = {'dirty': 0.14 if t['dark'] else 0.1, 'check': t['amber_fill'], 'clean': 1}[state]
        out = f'<rect x="{x}" y="{y}" width="{w}" height="52" rx="12" fill="{fill}" fill-opacity="{op}" stroke="{col}" stroke-width="2"/>'
        out += T(x + 16, y + 23, label, t['fg'], 14, mono=True)
        if note:
            out += T(x + 16, y + 42, note, t['sub'], 12)
        return out
    body += node(40, 160, 'count  4 → 6', 'dirty', note='set(6)')
    body += node(330, 90, 'double  8 → 12', 'check', note='CHECK → recalcula, mudou')
    body += node(330, 230, 'isEven  true → true', 'check', note='CHECK → recalcula, igual')
    body += node(620, 70, 'text(_m0, count)', 'dirty', note='DIRTY → roda')
    body += node(620, 160, 'text(_m1, double)', 'dirty', note='fonte mudou → roda')
    body += node(620, 250, 'classList(_p, isEven)', 'clean', note='fonte igual → pulado')
    # DOM
    body += node(910, 70, '#text "6"', 'check', w=230) + flash(1150, 82, t, 0.9)
    body += node(910, 160, '#text "12"', 'check', w=230) + flash(1150, 172, t, 0.9)
    body += node(910, 250, '<p class="even">', 'clean', w=230, note='intocado')
    # arestas
    e = lambda x1, y1, x2, y2, c: curve(x1, y1, x2, y2, c, 2.5)
    body += e(280, 186, 330, 116, CORAL) + e(280, 186, 330, 256, CORAL) 
    body += f'<path d="M280 172 C305 172 305 60 335 60 H585 C605 60 600 96 620 96" fill="none" stroke="{CORAL}" stroke-width="2.5" stroke-linecap="round"/>'
    body += e(570, 116, 620, 186, AMBER) + e(570, 256, 620, 276, t['line'])
    body += e(860, 96, 910, 96, AMBER) + e(860, 186, 910, 186, AMBER) + e(860, 276, 910, 276, t['line'])
    # fases
    phases = [('1', 'push', 'set() marca DIRTY os observadores diretos e CHECK os que dependem via memo'),
              ('2', 'pull', 'um nó CHECK pergunta às fontes memo se mudaram; se nenhuma mudou, volta a CLEAN'),
              ('3', 'flush', 'efeitos rodam numa fila de render e depois numa de usuário, ordenados por id (pai antes de filho)')]
    body += card(18, 326, 1152, 126, t, fill=t['soft'])
    for i, (n, name, desc) in enumerate(phases):
        y = 362 + i * 34
        body += f'<circle cx="48" cy="{y - 5}" r="11" fill="{CORAL}"/>' + T(48, y, n, PAPER, 12, bold=True, anchor='middle')
        body += T(70, y, name, t['fg'], 15, mono=True, bold=True) + T(130, y, desc, t['sub'], 15)
    # legenda
    for i, (c, lbl) in enumerate(((CORAL, 'DIRTY'), (AMBER, 'CHECK'), (t['line'], 'CLEAN'))):
        body += f'<rect x="40" y="{76 + i * 24}" width="14" height="14" rx="4" fill="{c}"/>' + T(62, 88 + i * 24, lbl, t['sub'], 12, mono=True)
    return doc_svg(W, H, body, 'Núcleo reativo push-pull: count muda, isEven recalcula igual e o classList não roda', t)


# ── 4. Proxy profundo e lazy ───────────────────────────────────────────────
def proxy_diagram(theme):
    t = theme_of(theme)
    W, H = 1188, 450
    body = card(18, 20, 330, 410, t)
    body += step(48, 56, 1, 'Você escreve', t)
    code = ['const todos = [', "  { title: 'Ler', done: false },", "  { title: 'Fazer', done: true },", "  { title: 'Rever', done: false },", ']', '', '<li>{todo.title}</li>', '<input checked={todo.done}/>']
    for i, l in enumerate(code):
        body += T(40, 104 + i * 26, l, t['fg'] if i < 5 else t['sub'], 13.5, mono=True)
    body += T(40, 330, 'Nenhuma anotação: o compilador', t['sub'], 14) + T(40, 352, 'envolve em reactive() porque é', t['sub'], 14) + T(40, 374, 'um array lido no JSX.', t['sub'], 14)

    body += card(372, 20, 430, 410, t)
    body += step(402, 56, 2, 'O proxy cria sob demanda', t)
    body += card(396, 90, 382, 64, t, r=12, fill=t['soft'])
    body += T(412, 112, 'todos (proxy)', t['fg'], 14, mono=True, bold=True)
    body += chip(412, 120, '$iter', t, w=70) + chip(490, 120, 'length', t, w=78)
    ys = [180, 262]
    for k, y in enumerate(ys):
        body += f'<path d="M{410} {154} V{y + 30} H{424}" fill="none" stroke="{t["line"]}" stroke-width="2"/>'
        body += card(424, y, 354, 64, t, r=12, fill=t['soft'])
        body += T(440, y + 22, f'todos[{k}] (proxy)', t['fg'], 14, mono=True, bold=True)
        body += chip(440, y + 30, 'title', t, w=64) + chip(512, y + 30, 'done', t, w=60, hot=k == 1)
    body += f'<path d="M410 {262 + 30} V{344 + 30} H424" fill="none" stroke="{t["line"]}" stroke-width="2"/>'
    body += card(424, 344, 354, 64, t, r=12, fill='none', dash=True)
    body += T(440, 368, 'todos[2] (raw)', t['sub'], 14, mono=True, bold=True)
    body += T(440, 392, 'ainda não lido: nenhum proxy, nenhum signal', t['sub'], 12.5)

    body += card(826, 20, 344, 410, t)
    body += step(856, 56, 3, 'Mutação notifica só a chave', t)
    body += card(846, 92, 304, 140, t, r=12, fill=t['soft'])
    body += T(862, 120, 'todos[1].done = false', t['fg'], 14, mono=True, bold=True)
    body += T(862, 148, 'incrementa o signal "done"', t['sub'], 13.5) + T(862, 168, 'do item 1', t['sub'], 13.5)
    body += chip(862, 186, '1 binding: o checkbox da linha 2', t, hot=True, w=270, mono=False)
    body += card(846, 250, 304, 160, t, r=12, fill=t['soft'])
    body += T(862, 278, "todos.push({ … })", t['fg'], 14, mono=True, bold=True)
    body += T(862, 306, 'roda no raw dentro de batch;', t['sub'], 13.5) + T(862, 326, 'notifica $iter e length', t['sub'], 13.5)
    body += chip(862, 344, 'list() cria 1 linha nova', t, hot=True, w=210, mono=False)
    body += T(862, 394, 'as outras linhas não rodam', t['sub'], 13.5)
    body += curve(574, 305, 846, 200, AMBER, 2.5, bend=0.6)
    return doc_svg(W, H, body, 'Proxy profundo e lazy: signals por propriedade criados sob demanda, notificação só da chave mutada', t)


# ── 5. Listas com chave (LIS) e selector ──────────────────────────────────
def list_diagram(theme):
    t = theme_of(theme)
    W, H = 1188, 400
    body = card(18, 20, 740, 360, t)
    body += step(48, 56, 1, 'Reconciliação por chave', t)
    old = ['A', 'B', 'C', 'D', 'E', 'G']
    new = ['A', 'D', 'B', 'C', 'E', 'F']
    lis = {'A', 'B', 'C', 'E'}
    bx, sp, yo, yn = 150, 92, 104, 250
    body += T(48, yo + 30, 'antes', t['sub'], 14) + T(48, yn + 30, 'depois', t['sub'], 14)
    pos_old = {k: bx + i * sp for i, k in enumerate(old)}
    pos_new = {k: bx + i * sp for i, k in enumerate(new)}
    for k in old:
        if k in pos_new:
            c = CORAL if k not in lis else t['line']
            body += f'<path d="M{pos_old[k] + 30} {yo + 46} C{pos_old[k] + 30} {yo + 110} {pos_new[k] + 30} {yn - 64} {pos_new[k] + 30} {yn}" fill="none" stroke="{c}" stroke-width="{3 if k not in lis else 2}"/>'
    def row(x, y, k, state):
        styles = {
            'still': (t['card'], 1, t['line'], ''),
            'moved': (CORAL, 0.14 if t['dark'] else 0.1, CORAL, ''),
            'new': (AMBER, t['amber_fill'], AMBER, ''),
            'gone': ('none', 1, t['line'], ' stroke-dasharray="5 4"'),
        }
        f, o, s, d = styles[state]
        return (f'<rect x="{x}" y="{y}" width="60" height="46" rx="10" fill="{f}" fill-opacity="{o}" stroke="{s}" stroke-width="2"{d}/>'
                + T(x + 30, y + 29, k, t['sub'] if state == 'gone' else t['fg'], 17, mono=True, bold=True, anchor='middle'))
    for k in old:
        body += row(pos_old[k], yo, k, 'gone' if k not in pos_new else ('still' if k in lis else 'moved'))
    for k in new:
        body += row(pos_new[k], yn, k, 'new' if k not in pos_old else ('still' if k in lis else 'moved'))
    leg = [('still', 'na LIS: fica parado'), ('moved', 'insertBefore (mesmo nó)'), ('new', 'criado'), ('gone', 'descartado')]
    lx = 48
    for st_, lbl in leg:
        f = {'still': t['card'], 'moved': CORAL, 'new': AMBER, 'gone': 'none'}[st_]
        s = {'still': t['line'], 'moved': CORAL, 'new': AMBER, 'gone': t['line']}[st_]
        o = {'still': 1, 'moved': 0.25, 'new': t['amber_fill'], 'gone': 1}[st_]
        d = ' stroke-dasharray="4 3"' if st_ == 'gone' else ''
        body += f'<rect x="{lx}" y="336" width="18" height="18" rx="5" fill="{f}" fill-opacity="{o}" stroke="{s}" stroke-width="2"{d}/>' + T(lx + 26, 350, lbl, t['sub'], 13.5)
        lx += len(lbl) * 7.4 + 60

    body += card(782, 20, 388, 360, t)
    body += step(812, 56, 2, 'selector: O(1) por linha', t)
    body += T(806, 100, 'selected = 2 → 5', t['fg'], 15, mono=True, bold=True)
    for i in range(7):
        y = 118 + i * 30
        hot = i in (1, 4)
        body += f'<rect x="806" y="{y}" width="340" height="24" rx="7" fill="{AMBER if hot else t["soft"]}" fill-opacity="{t["amber_fill"] if hot else 1}" stroke="{AMBER if hot else t["line"]}" stroke-width="{2 if hot else 1}"/>'
        body += T(820, y + 17, f'linha {i + 1}', t['fg'] if hot else t['sub'], 13, mono=True)
        if hot:
            body += T(1132, y + 17, 'reage', t['fg'], 12.5, anchor='end', bold=True)
    body += T(806, 348, 'Map<valor, observadores>: só a linha', t['sub'], 13.5) + T(806, 368, 'que sai e a que entra são marcadas', t['sub'], 13.5)
    return doc_svg(W, H, body, 'Listas com chave: prefixo e sufixo comuns, Map de posições e LIS; selector marca só duas linhas', t)


# ── 6. Async: await, abort e Boundary ──────────────────────────────────────
def async_diagram(theme):
    t = theme_of(theme)
    W, H = 1188, 380
    body = card(18, 20, 1152, 340, t)
    body += T(48, 62, 'const user = await api.user(id)', t['fg'], 17, mono=True, bold=True)
    body += T(48, 88, 'o compilador transforma em recurso: refaz quando id muda e aborta a requisição anterior', t['sub'], 14)
    lanes = [('id', 140), ('requisição', 206), ('tela', 272)]
    x0, x1 = 190, 1130
    for name, y in lanes:
        body += T(48, y + 5, name, t['sub'], 14, bold=True)
        body += f'<path d="M{x0} {y} H{x1}" stroke="{t["line"]}" stroke-width="2"/>'
    for x, v in ((200, '1'), (520, '2'), (700, '3')):
        body += f'<circle cx="{x}" cy="140" r="15" fill="{CORAL}"/>' + T(x, 145, v, PAPER, 14, bold=True, anchor='middle', mono=True)
    def bar(xa, xb, y, label, state):
        col = {'ok': t['st'], 'abort': CORAL, 'run': t['sub']}[state]
        out = f'<rect x="{xa}" y="{y - 13}" width="{xb - xa}" height="26" rx="8" fill="{col}" fill-opacity="0.16" stroke="{col}" stroke-width="2"/>'
        out += T(xa + 12, y + 5, label, t['fg'], 13, mono=True)
        return out
    body += bar(200, 440, 206, 'GET /users/1', 'ok')
    body += bar(520, 700, 206, 'GET /users/2', 'abort')
    body += f'<g stroke="{CORAL}" stroke-width="3" stroke-linecap="round"><path d="M692 196 L708 216"/><path d="M708 196 L692 216"/></g>'
    body += T(712, 238, 'AbortSignal', t['sub'], 12, mono=True)
    body += bar(700, 960, 206, 'GET /users/3', 'ok')
    # tela
    body += f'<rect x="200" y="259" width="240" height="26" rx="8" fill="{t["soft"]}" stroke="{t["line"]}" stroke-width="2" stroke-dasharray="5 4"/>' + T(212, 277, '<Boundary pending>', t['sub'], 13, mono=True)
    body += f'<rect x="440" y="259" width="80" height="26" rx="8" fill="{t["card"]}" stroke="{t["line"]}" stroke-width="2"/>' + T(452, 277, 'Ana', t['fg'], 13, mono=True)
    body += f'<rect x="520" y="259" width="440" height="26" rx="8" fill="{t["card"]}" stroke="{t["line"]}" stroke-width="2" opacity="0.55"/>' + T(532, 277, 'Ana  ·  pending(user) = true (conteúdo mantido)', t['sub'], 13, mono=True)
    body += f'<rect x="960" y="259" width="170" height="26" rx="8" fill="{AMBER}" fill-opacity="{t["amber_fill"]}" stroke="{AMBER}" stroke-width="2"/>' + T(972, 277, 'Caio', t['fg'], 13, mono=True)
    body += flash(1140, 260, t, 0.8)
    body += T(48, 330, 'Primeira carga mostra o pending do Boundary. Depois, o conteúdo antigo fica na tela com pending(user) até o novo chegar.', t['sub'], 14)
    return doc_svg(W, H, body, 'Async: await vira recurso, id novo aborta a requisição anterior, Boundary mostra pending só na primeira carga', t)


# ── 7. Benchmark vs Solid ──────────────────────────────────────────────────
BENCH = [('create 1k', 1.11, True), ('replace 1k', 1.30, False), ('update 10th', 1.14, True), ('select', 0.86, True),
         ('swap', 1.07, True), ('remove', 1.01, True), ('create 10k', 0.99, True), ('append 1k', 1.09, True), ('clear', 1.22, True)]


def bench_chart(theme):
    t = theme_of(theme)
    W, H = 1188, 420
    x0, y0, cw, ch = 90, 50, 930, 280
    lo, hi = 0.6, 1.4
    Y = lambda v: y0 + ch - (v - lo) / (hi - lo) * ch
    body = card(18, 16, 1152, 388, t)
    for v in (0.6, 0.8, 1.0, 1.2, 1.4):
        body += f'<path d="M{x0} {Y(v):.1f} H{x0 + cw}" stroke="{t["line"]}" stroke-width="1"/>'
        body += T(x0 - 12, Y(v) + 5, f'{v:.1f}×'.replace('.', ','), t['sub'], 13, mono=True, anchor='end')
    body += f'<rect x="{x0}" y="{Y(1.1):.1f}" width="{cw}" height="{Y(1.0) - Y(1.1):.1f}" fill="{AMBER}" fill-opacity="0.14"/>'
    body += f'<path d="M{x0} {Y(1.0):.1f} H{x0 + cw}" stroke="{t["fg"]}" stroke-width="2" stroke-dasharray="6 5"/>'
    body += T(x0 + cw + 14, Y(1.0) + 5, 'Solid = 1,0×', t['fg'], 13, bold=True)
    body += T(x0 + cw + 14, Y(1.1) - 2, 'meta: até +10%', t['sub'], 13)
    slot = cw / len(BENCH)
    for i, (name, v, ok) in enumerate(BENCH):
        cx = x0 + slot * i + slot / 2
        bw = slot * 0.5
        col = CORAL if not ok else (t['st'] if v <= 1.0 else t['sub'])
        top, base = Y(v), Y(lo)
        body += f'<rect x="{cx - bw / 2:.1f}" y="{top:.1f}" width="{bw:.1f}" height="{base - top:.1f}" rx="6" fill="{col}" fill-opacity="{0.9 if not ok else 0.75}"/>'
        body += T(cx, top - 8, f'{v:.2f}×'.replace('.', ','), t['fg'], 13, mono=True, bold=True, anchor='middle')
        body += T(cx, y0 + ch + 22, name, t['sub'], 13, anchor='middle')
    lx = 90
    for c, lbl in ((t['st'], 'mais rápido que Solid'), (t['sub'], 'dentro do critério'), (CORAL, 'fora (em otimização)')):
        body += f'<rect x="{lx}" y="374" width="14" height="14" rx="4" fill="{c}"/>' + T(lx + 22, 386, lbl, t['sub'], 13)
        lx += len(lbl) * 7.4 + 54
    body += T(1150, 386, 'menor é melhor · 3 rodadas × 10 execuções', t['sub'], 13, anchor='end')
    return doc_svg(W, H, body, 'Benchmark local: tempo relativo ao Solid por cenário do js-framework-benchmark', t)


# ── 8. Features ────────────────────────────────────────────────────────────
def icon(kind, cx, cy, t):
    fg = t['fg']
    s = f'stroke="{fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"'
    if kind == 'once':
        return f'<circle cx="{cx}" cy="{cy}" r="15" {s}/>' + T(cx, cy + 6, '1×', CORAL, 15, bold=True, anchor='middle', mono=True)
    if kind == 'node':
        return (f'<path d="M{cx - 14} {cy - 12} V{cy + 12} M{cx - 14} {cy - 2} H{cx} M{cx - 14} {cy + 12} H{cx}" {s}/>'
                f'<circle cx="{cx + 6}" cy="{cy - 2}" r="5" fill="{AMBER}"/><circle cx="{cx - 14}" cy="{cy - 14}" r="4" fill="{CORAL}"/>' + flash(cx + 14, cy - 12, t, 0.6))
    if kind == 'async':
        return (f'<circle cx="{cx}" cy="{cy}" r="15" {s}/><path d="M{cx} {cy - 8} V{cy} L{cx + 7} {cy + 5}" {s}/>'
                f'<circle cx="{cx + 13}" cy="{cy - 11}" r="5" fill="{CORAL}"/>')
    if kind == 'store':
        return (f'<path d="M{cx - 15} {cy - 6} L{cx} {cy - 14} L{cx + 15} {cy - 6} L{cx} {cy + 2} Z" {s}/>'
                f'<path d="M{cx - 15} {cy + 2} L{cx} {cy + 10} L{cx + 15} {cy + 2}" {s}/><circle cx="{cx}" cy="{cy - 6}" r="4" fill="{CORAL}"/>')
    if kind == 'list':
        return ''.join(f'<path d="M{cx - 14} {cy - 10 + i * 10} H{cx + 14}" {s}/>' for i in range(3)) + f'<circle cx="{cx + 14}" cy="{cy}" r="5" fill="{AMBER}"/>'
    if kind == 'tsx':
        return T(cx, cy + 6, '</>', fg, 17, bold=True, anchor='middle', mono=True) + f'<circle cx="{cx + 16}" cy="{cy - 12}" r="4" fill="{CORAL}"/>'
    if kind == 'dev':
        return (f'<rect x="{cx - 16}" y="{cy - 12}" width="32" height="24" rx="5" {s}/>'
                f'<rect x="{cx - 8}" y="{cy - 4}" width="16" height="8" rx="2" fill="{AMBER}"/>')
    if kind == 'test':
        return f'<path d="M{cx - 12} {cy} L{cx - 3} {cy + 9} L{cx + 13} {cy - 9}" {s}/><circle cx="{cx + 13}" cy="{cy + 10}" r="4" fill="{CORAL}"/>'
    return ''


FEATURES = [
    ('once', 'Roda uma vez', ['O corpo do componente é setup:', 'sem re-render e sem hooks.']),
    ('node', 'Reatividade por nó', ['Cada parte dinâmica é um binding', 'com referência direta ao nó.']),
    ('async', 'Async nativo', ['await no componente, abort', 'automático e <Boundary>.']),
    ('store', 'Stores sem seletor', ['createStore com proxy: só', 'quem lê a chave reage.']),
    ('list', 'Listas com chave', ['Reconciliação com LIS e', 'selector O(1) por linha.']),
    ('tsx', 'TSX válido', ['tsc, ESLint e o editor', 'funcionam sem plugin novo.']),
    ('dev', 'Devtools e HMR', ['Flash nos nós atualizados;', 'HMR preserva os stores.']),
    ('test', 'Testes de custo', ['counts() prova quantos efeitos', 'rodaram e quantos nós mudaram.']),
]


def features(theme):
    t = theme_of(theme)
    W, H = 1188, 404
    cw, chh, gap = 279, 182, 12
    body = ''
    for i, (ic, title, lines) in enumerate(FEATURES):
        x = 18 + (i % 4) * (cw + gap)
        y = 16 + (i // 4) * (chh + gap)
        body += card(x, y, cw, chh, t)
        body += f'<circle cx="{x + 46}" cy="{y + 50}" r="28" fill="{t["soft"]}"/>' + icon(ic, x + 46, y + 50, t)
        body += T(x + 24, y + 116, title, t['fg'], 18, bold=True)
        for j, l in enumerate(lines):
            body += T(x + 24, y + 142 + j * 21, l, t['sub'], 14)
    return doc_svg(W, H, body, 'Features do Jotastic', t)


for t in ('light', 'dark'):
    write(f'compare-{t}.svg', compare(t))
    write(f'pipeline-{t}.svg', pipeline(t))
    write(f'reactive-{t}.svg', reactive_graph(t))
    write(f'proxy-{t}.svg', proxy_diagram(t))
    write(f'lists-{t}.svg', list_diagram(t))
    write(f'async-{t}.svg', async_diagram(t))
    write(f'bench-{t}.svg', bench_chart(t))
    write(f'features-{t}.svg', features(t))
print('diagramas ok')
