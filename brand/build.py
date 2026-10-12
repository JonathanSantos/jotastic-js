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
