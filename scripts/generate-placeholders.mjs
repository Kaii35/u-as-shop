import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const P = { blush: '#E8C8CF', nude: '#F5E7E8', ivory: '#FAF7F2', wine: '#572B3A', wineDark: '#3F1E2A', ink: '#242124' };

/* ---------- color helpers ---------- */
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
const light = (c, t = 0.35) => mix(c, '#ffffff', t);
const dark = (c, t = 0.3) => mix(c, '#1a1114', t);

let uid = 0;
const id = (p) => `${p}${++uid}`;

/* ---------- primitivas ---------- */
/** Degradado horizontal tipo vidrio con reflejo lateral. */
function glass(color) {
  const g = id('g');
  return [g, `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${dark(color, 0.22)}"/>
    <stop offset=".18" stop-color="${color}"/>
    <stop offset=".42" stop-color="${light(color, 0.55)}"/>
    <stop offset=".58" stop-color="${color}"/>
    <stop offset="1" stop-color="${dark(color, 0.32)}"/>
  </linearGradient>`];
}
const shadow = (cy, rx, ry = rx * 0.16) => `<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}" fill="${P.wine}" opacity=".13"/>`;
const gloss = (x, y, w, h, r = w / 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff" opacity=".4"/>`;
/** Silueta de una almendrada (alto ~130, ancho ~62). */
const nail = (fill, op = 1) => `<path d="M-31 62 C-33 -8 -25 -54 0 -60 C25 -54 33 -8 31 62 C21 72 -21 72 -31 62 Z" fill="${fill}" opacity="${op}"/>`;

/* ---------- objetos de producto ---------- */
const O = {
  bottle(c) {
    const [g, d] = glass(c); const [g2, d2] = glass(mix(c, P.wineDark, 0.55));
    return { defs: d + d2, body: `${shadow(200, 120)}
      <rect x="-78" y="10" width="156" height="185" rx="26" fill="url(#${g})"/>
      ${gloss(-52, 32, 16, 140)}
      <rect x="-26" y="-14" width="52" height="30" fill="${dark(c, 0.25)}"/>
      <rect x="-42" y="-160" width="84" height="150" rx="14" fill="url(#${g2})"/>
      ${gloss(-26, -142, 11, 110)}
      <rect x="-78" y="120" width="156" height="34" fill="#fff" opacity=".85"/>` };
  },

  slim(c) {
    const [g, d] = glass(c); const [g2, d2] = glass(P.wineDark);
    return { defs: d + d2, body: `${shadow(205, 95)}
      <rect x="-58" y="-30" width="116" height="230" rx="22" fill="url(#${g})"/>
      ${gloss(-38, -10, 13, 180)}
      <rect x="-20" y="-52" width="40" height="26" fill="${dark(c, 0.3)}"/>
      <rect x="-34" y="-190" width="68" height="140" rx="12" fill="url(#${g2})"/>
      ${gloss(-20, -174, 9, 100)}` };
  },

  jar(c) {
    const [g, d] = glass(c); const [g2, d2] = glass(P.blush);
    return { defs: d + d2, body: `${shadow(190, 130)}
      <rect x="-104" y="0" width="208" height="175" rx="20" fill="url(#${g})"/>
      <ellipse cx="0" cy="175" rx="104" ry="18" fill="${dark(c, 0.2)}"/>
      <ellipse cx="0" cy="0" rx="104" ry="20" fill="${light(c, 0.45)}"/>
      ${gloss(-76, 24, 17, 120)}
      <rect x="-112" y="-70" width="224" height="76" rx="16" fill="url(#${g2})"/>
      <ellipse cx="0" cy="-70" rx="112" ry="19" fill="${light(P.blush, 0.5)}"/>
      ${gloss(-84, -58, 15, 48)}` };
  },

  lamp() {
    const [g, d] = glass(P.ivory); const [g2, d2] = glass(P.blush);
    const led = (y, op) => [-58, -20, 20, 58].map((x) => `<rect x="${x - 9}" y="${y}" width="18" height="7" rx="3.5" fill="${P.blush}" opacity="${op}"/>`).join('');
    return { defs: d + d2, body: `${shadow(200, 160)}
      <path d="M-150 190 L-150 30 A150 150 0 0 1 150 30 L150 190 Z" fill="url(#${g})"/>
      <path d="M-96 190 L-96 46 A96 96 0 0 1 96 46 L96 190 Z" fill="${P.wineDark}"/>
      ${led(60, '.9')}${led(92, '.6')}
      <rect x="-150" y="184" width="300" height="20" rx="8" fill="url(#${g2})"/>
      <rect x="-40" y="140" width="80" height="22" rx="11" fill="${P.wine}"/>` };
  },

  kit(cs) {
    const parts = cs.slice(0, 4).map((c, i) => {
      const [g, d] = glass(c); const x = -138 + i * 92; const dy = (i % 2) * 18;
      return [d, `<rect x="${x}" y="${-40 + dy}" width="72" height="200" rx="16" fill="url(#${g})"/>
        <rect x="${x + 8}" y="${-24 + dy}" width="9" height="150" rx="4.5" fill="#fff" opacity=".4"/>
        <rect x="${x + 16}" y="${-72 + dy}" width="40" height="36" rx="8" fill="${P.wineDark}"/>`];
    });
    return { defs: parts.map((p) => p[0]).join(''), body: shadow(178, 175) + parts.map((p) => p[1]).join('') };
  },

  brushes() {
    const [g, d] = glass(P.wineDark); const [g2, d2] = glass(P.blush);
    const PIV = 180; // los mangos convergen abajo, las puntas se abren arriba
    const b = (i, n) => {
      const a = (i - (n - 1) / 2) * 11.5; const light = i % 2 === 1;
      return `<g transform="translate(0,${PIV}) rotate(${a}) translate(0,${-PIV})">
        <rect x="-8" y="-46" width="16" height="226" rx="8" fill="url(#${light ? g2 : g})"/>
        <rect x="-9" y="-70" width="18" height="26" rx="4" fill="${mix(P.blush, '#fff', 0.35)}"/>
        <path d="M-8 -70 C-7 -96 -3 -118 0 -128 C3 -118 7 -96 8 -70 Z" fill="${light ? '#9C7F70' : '#6B5348'}"/>
        <rect x="-3" y="-20" width="4" height="150" rx="2" fill="#fff" opacity=".24"/></g>`;
    };
    const n = 7;
    return { defs: d + d2, body: shadow(198, 140) + `<g transform="translate(0,10)">${Array.from({ length: n }, (_, i) => b(i, n)).join('')}</g>` };
  },

  lashes() {
    const [g, d] = glass(P.wineDark);
    const strip = (y, n) => `<g transform="translate(0,${y})">
      <rect x="-130" y="-4" width="260" height="8" rx="4" fill="${P.wine}"/>
      ${Array.from({ length: n }, (_, i) => { const x = -124 + i * (248 / (n - 1)); return `<path d="M${x} -4 C${x - 3} -22 ${x - 9} -34 ${x - 17} -40" stroke="${P.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`; }).join('')}</g>`;
    return { defs: d, body: `${shadow(205, 150)}
      <rect x="-155" y="-130" width="310" height="320" rx="18" fill="url(#${g})"/>
      <rect x="-140" y="-114" width="280" height="288" rx="12" fill="${P.ivory}"/>
      ${strip(-40, 11)}${strip(52, 11)}${strip(144, 11)}` };
  },

  dropper(c) {
    const [g, d] = glass(c);
    return { defs: d, body: `${shadow(200, 80)}
      <rect x="-62" y="-10" width="124" height="205" rx="30" fill="url(#${g})"/>
      ${gloss(-42, 14, 14, 150)}
      <rect x="-30" y="-40" width="60" height="32" rx="6" fill="${P.blush}"/>
      <rect x="-22" y="-155" width="44" height="118" rx="12" fill="${P.wineDark}"/>
      <rect x="-13" y="-140" width="7" height="80" rx="3.5" fill="#fff" opacity=".28"/>
      <rect x="-70" y="90" width="140" height="42" rx="6" fill="#fff" opacity=".85"/>` };
  },

  foils(cs) {
    const parts = cs.slice(0, 3).map((c, i) => {
      const [g, d] = glass(c); const y = -70 + i * 98;
      return [d, `<g transform="translate(${i % 2 ? 24 : -24},${y})">
        <rect x="-120" y="-38" width="240" height="76" rx="38" fill="url(#${g})"/>
        <ellipse cx="-120" cy="0" rx="17" ry="38" fill="${light(c, 0.6)}"/>
        <ellipse cx="-120" cy="0" rx="8" ry="19" fill="${dark(c, 0.35)}"/>
        <rect x="-70" y="-22" width="150" height="7" rx="3.5" fill="#fff" opacity=".5"/></g>`];
    });
    return { defs: parts.map((p) => p[0]).join(''), body: shadow(200, 150) + parts.map((p) => p[1]).join('') };
  },

  drill() {
    const [g, d] = glass(P.ivory); const [g2, d2] = glass(P.wineDark);
    return { defs: d + d2, body: `${shadow(205, 155)}
      <g transform="rotate(-16)">
        <rect x="-44" y="-170" width="88" height="300" rx="44" fill="url(#${g})"/>
        <rect x="-44" y="-60" width="88" height="70" fill="url(#${g2})"/>
        <rect x="-30" y="-150" width="12" height="90" rx="6" fill="#fff" opacity=".55"/>
        <rect x="-16" y="130" width="32" height="46" rx="6" fill="${P.blush}"/>
        <rect x="-9" y="170" width="18" height="34" rx="9" fill="${P.wine}"/>
      </g>
      <g transform="translate(150,90)">${[0, 1, 2].map((i) => `<g transform="translate(${i * 30},0) rotate(12)">
        <rect x="-5" y="-60" width="10" height="90" rx="5" fill="${P.blush}"/>
        <path d="M-13 -60 C-13 -95 13 -95 13 -60 Z" fill="${P.wine}"/></g>`).join('')}</g>` };
  },

  pump(c) {
    const [g, d] = glass(c);
    return { defs: d, body: `${shadow(200, 95)}
      <rect x="-84" y="-20" width="168" height="215" rx="18" fill="url(#${g})"/>
      ${gloss(-58, 4, 16, 160)}
      <rect x="-34" y="-46" width="68" height="28" fill="${dark(c, 0.3)}"/>
      <rect x="-30" y="-118" width="60" height="74" rx="10" fill="${P.wineDark}"/>
      <path d="M-30 -118 h60 v-16 h-34 a10 10 0 0 0 -10 10 v6 Z" fill="${P.wine}"/>
      <rect x="-84" y="96" width="168" height="46" fill="#fff" opacity=".85"/>` };
  },

  tube(c) {
    const [g, d] = glass(c);
    return { defs: d, body: `${shadow(205, 88)}
      <path d="M-76 -140 L76 -140 L62 180 L-62 180 Z" fill="url(#${g})"/>
      <rect x="-76" y="-152" width="152" height="16" rx="4" fill="${dark(c, 0.3)}"/>
      ${gloss(-50, -118, 15, 250)}
      <rect x="-34" y="180" width="68" height="36" rx="8" fill="${P.wineDark}"/>
      <rect x="-62" y="10" width="124" height="52" rx="4" fill="#fff" opacity=".8"/>` };
  },

  organizer() {
    const [g, d] = glass(P.ivory);
    const cols = [P.blush, '#D9A5AE', '#9E1F36', '#E3C1B3', '#5E2433', '#C7B8E0', '#EDBBA6', '#7A5347'];
    const mini = (x, y, c) => `<g transform="translate(${x},${y})"><rect x="-13" y="-14" width="26" height="30" rx="5" fill="${c}"/><rect x="-7" y="-30" width="14" height="17" rx="3" fill="${P.wineDark}"/></g>`;
    return { defs: d, body: `${shadow(205, 165)}
      <path d="M-170 -110 L170 -110 L150 180 L-150 180 Z" fill="url(#${g})" opacity=".92"/>
      ${[0, 1, 2].map((r) => `<path d="M${-166 + r * 6} ${-70 + r * 82} L${166 - r * 6} ${-70 + r * 82}" stroke="${P.wine}" stroke-width="3" opacity=".35"/>`).join('')}
      ${[0, 1, 2, 3].map((c) => `<path d="M${-128 + c * 85} -110 L${-120 + c * 77} 180" stroke="${P.wine}" stroke-width="2.5" opacity=".22"/>`).join('')}
      ${[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => mini(-128 + c * 85, -92 + r * 82, cols[(r * 4 + c) % 8]))).join('')}` };
  },

  kitBox() {
    const [g, d] = glass(P.wine);
    const vial = (x, c) => `<g transform="translate(${x},70)"><rect x="-19" y="-70" width="38" height="110" rx="10" fill="${c}"/><rect x="-12" y="-96" width="24" height="30" rx="5" fill="${P.wineDark}"/>${gloss(-13, -56, 7, 70)}</g>`;
    return { defs: d, body: `${shadow(205, 160)}
      <rect x="-165" y="-60" width="330" height="245" rx="16" fill="url(#${g})"/>
      <rect x="-150" y="-46" width="300" height="200" rx="10" fill="${P.nude}"/>
      ${vial(-96, '#D9A5AE')}${vial(-32, P.ivory)}${vial(32, '#E3C1B3')}${vial(96, '#7A5347')}
      <rect x="-90" y="-116" width="180" height="46" rx="10" fill="${P.wineDark}"/>` };
  },

  crystals() {
    const [g, d] = glass(P.ivory);
    const cols = ['#D9A5AE', P.blush, '#C7B8E0', '#F1E6DF', '#9E1F36', '#D4A08E'];
    const gem = (x, y, r, c, rot) => `<g transform="translate(${x},${y}) rotate(${rot})">
      <path d="M0 ${-r} L${r * 0.87} ${-r * 0.5} L${r * 0.87} ${r * 0.5} L0 ${r} L${-r * 0.87} ${r * 0.5} L${-r * 0.87} ${-r * 0.5} Z" fill="${c}"/>
      <path d="M0 ${-r} L${r * 0.87} ${-r * 0.5} L0 0 Z" fill="#fff" opacity=".55"/>
      <path d="M0 0 L${r * 0.87} ${r * 0.5} L0 ${r} Z" fill="#000" opacity=".12"/></g>`;
    const gems = [[-100, -40, 30], [-30, -70, 22], [38, -44, 34], [104, -76, 20], [-116, 34, 24], [-44, 16, 38], [36, 42, 26], [108, 10, 30], [-84, 108, 20], [-6, 100, 28], [70, 116, 22], [126, 74, 18]]
      .map(([x, y, r], i) => gem(x, y, r, cols[i % 6], (i * 23) % 60)).join('');
    return { defs: d, body: `${shadow(205, 160)}
      <rect x="-165" y="-120" width="330" height="290" rx="18" fill="url(#${g})"/>
      <rect x="-150" y="-106" width="300" height="262" rx="12" fill="${P.nude}"/>${gems}` };
  },
};

/* ---------- lienzo ---------- */
function canvas(w, h, inner, { a = P.ivory, b = P.nude, c = P.blush } = {}) {
  const bg = id('bg'); const vg = id('v');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
  <defs>
    <linearGradient id="${bg}" x1="0" y1="0" x2=".6" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
    </linearGradient>
    <radialGradient id="${vg}" cx=".5" cy=".42" r=".72">
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="${P.wine}" stop-opacity=".16"/>
    </radialGradient>
    ${inner.defs ?? ''}
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${bg})"/>
  ${inner.body}
  <rect width="${w}" height="${h}" fill="url(#${vg})"/>
</svg>`;
}

/* ---------- ficha de producto 4:5 ---------- */
const W = 800; const H = 1000;

function packshot(obj, shades, variant) {
  const isB = variant === 'b';
  const swatches = (shades ?? []).slice(0, 5)
    .map((c, i) => `<circle cx="${112 + i * 52}" cy="${H - 92}" r="19" fill="${c}" stroke="#fff" stroke-width="3"/>`).join('');
  const body = `
    <circle cx="${W / 2}" cy="${isB ? 430 : 470}" r="${isB ? 250 : 300}" fill="#fff" opacity="${isB ? '.34' : '.5'}"/>
    <path d="M0 ${H} L0 ${H - 210} Q ${W / 2} ${H - 330} ${W} ${H - 210} L${W} ${H} Z" fill="${P.blush}" opacity=".45"/>
    <g transform="translate(${W / 2},${isB ? 545 : 520}) rotate(${isB ? -14 : 0}) scale(${isB ? 1.34 : 1})">${obj.body}</g>
    ${swatches}`;
  const tint = isB ? { a: P.nude, b: P.blush, c: mix(P.blush, P.wine, 0.18) } : {};
  return canvas(W, H, { defs: obj.defs, body }, tint);
}

/* ---------- editorial ---------- */
const NAIL_COLS = ['#D9A5AE', '#E3C1B3', '#9E1F36', '#5E2433', '#EBC3C6', '#C7B8E0', '#7A5347', '#F1E6DF'];
const shine = `<path d="M-31 62 C-33 -8 -25 -54 0 -60 C10 -56 18 -42 23 -22 L-26 30 Z" fill="#fff" opacity=".2"/>`;

/** Rueda de muestras: puntas de una en abanico alrededor de un eje. */
function wheel(n, R, s, cols = NAIL_COLS, spread = 305) {
  const tips = Array.from({ length: n }, (_, i) => {
    const a = -spread / 2 + i * (spread / (n - 1));
    return `<g transform="rotate(${a.toFixed(1)}) translate(0,${-R}) scale(${s})">
      <path d="M-31 62 C-33 -8 -25 -54 0 -60 C25 -54 33 -8 31 62 C21 72 -21 72 -31 62 Z" fill="${P.wine}" opacity=".18" transform="translate(5,7)"/>
      ${nail(cols[i % cols.length])}${shine}</g>`;
  }).join('');
  return `${tips}
    <circle cx="0" cy="0" r="${(R * 0.3).toFixed(0)}" fill="#fff" opacity=".75"/>
    <circle cx="0" cy="0" r="${(R * 0.3).toFixed(0)}" fill="none" stroke="${P.wine}" stroke-width="3" opacity=".3"/>
    <circle cx="0" cy="0" r="${(R * 0.11).toFixed(0)}" fill="${P.wine}" opacity=".55"/>`;
}

/** Primer plano: dos o tres unas superpuestas ocupando el encuadre. */
function closeup(s, cols = NAIL_COLS) {
  return [0, 1, 2].map((i) => `<g transform="translate(${(i - 1) * 78 * s},${Math.abs(i - 1) * 26 * s}) rotate(${(i - 1) * 7}) scale(${s})">
    <path d="M-31 62 C-33 -8 -25 -54 0 -60 C25 -54 33 -8 31 62 C21 72 -21 72 -31 62 Z" fill="${P.wine}" opacity=".16" transform="translate(6,9)"/>
    ${nail(cols[i])}
    <ellipse cx="0" cy="56" rx="25" ry="11" fill="#fff" opacity=".3"/>${shine}</g>`).join('');
}

function editorial(w, h, { motif = 'wheel', tint, cols, obj } = {}) {
  const m = Math.min(w, h);
  let art;
  if (motif === 'wheel') art = `<g transform="translate(${w / 2},${h * 0.5})">${wheel(12, m * 0.27, m / 560, cols)}</g>`;
  else if (motif === 'closeup') art = `<g transform="translate(${w / 2},${h * 0.52})">${closeup(m / 280, cols)}</g>`;
  else art = `<g transform="translate(${w / 2},${h * 0.5}) scale(${(m / 620).toFixed(3)})">${obj.body}</g>`;
  const body = `
    <path d="M${w * 0.07} ${h} L${w * 0.07} ${h * 0.4} A${w * 0.43} ${w * 0.43} 0 0 1 ${w * 0.93} ${h * 0.4} L${w * 0.93} ${h} Z" fill="#fff" opacity=".4"/>
    <circle cx="${w * 0.82}" cy="${h * 0.15}" r="${w * 0.14}" fill="${P.wine}" opacity=".11"/>
    <circle cx="${w * 0.15}" cy="${h * 0.8}" r="${w * 0.1}" fill="${P.wine}" opacity=".07"/>
    ${art}`;
  return canvas(w, h, { body, defs: obj?.defs }, tint);
}

/* ---------- salida ---------- */
const write = (rel, svg) => { const f = join(OUT, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, svg.replace(/\n\s+/g, '\n')); };

const SEMI = ['#D9A5AE', '#E3C1B3', '#F1E6DF', '#9E1F36', '#5E2433', '#7A5347', '#242124'];
const RUBBER = ['#EBC3C6', '#F4F1EE', '#F5EFE8', '#EDBBA6'];
const POLY = ['#E3B7B0', '#E6CDB5', '#F2EFEC', '#C99AA3'];
const SKIN = ['#F1D6C6', '#E6C3A8', '#CFA07C', '#A87555', '#7A4E36'];
const CHROME = ['#C9CBD0', '#D4A08E', '#C7B8E0'];

const PRODUCTS = {
  p1: () => [O.bottle('#D9A5AE'), SEMI],
  p2: () => [O.jar('#EDE7E2'), null],
  p3: () => [O.lamp(), null],
  p4: () => [O.kit(POLY), POLY],
  p5: () => [O.brushes(), null],
  p6: () => [O.slim('#EFE6DF'), null],
  p7: () => [O.lashes(), null],
  p8: () => [O.dropper('#E8C9A8'), null],
  p9: () => [O.foils(CHROME), CHROME],
  p10: () => [O.drill(), null],
  p11: () => [O.bottle('#EBC3C6'), RUBBER],
  p12: () => [O.pump('#E6C3A8'), SKIN],
  p13: () => [O.tube('#F3E4E6'), null],
  p14: () => [O.organizer(), null],
  p15: () => [O.kitBox(), null],
  p16: () => [O.crystals(), null],
};
for (const [pid, make] of Object.entries(PRODUCTS)) {
  for (const v of ['a', 'b']) { const [obj, shades] = make(); write(`products/${pid}-${v}.svg`, packshot(obj, shades, v)); }
}

const CATS = {
  c1: () => O.slim('#EFE6DF'), c2: () => O.bottle('#9E1F36'), c3: () => O.jar('#EDE7E2'),
  c4: () => O.crystals(), c5: () => O.lamp(), c6: () => O.lashes(),
  c7: () => O.tube('#F3E4E6'), c8: () => O.pump('#CFA07C'), c9: () => O.organizer(),
};
for (const [cid, make] of Object.entries(CATS)) {
  const obj = make();
  const body = `<circle cx="${W / 2}" cy="440" r="290" fill="#fff" opacity=".38"/>
    <g transform="translate(${W / 2},500) rotate(-6) scale(1.05)">${obj.body}</g>
    <rect y="${H * 0.45}" width="${W}" height="${H * 0.55}" fill="${P.ink}" opacity=".08"/>`;
  write(`categories/${cid}.svg`, canvas(W, H, { defs: obj.defs, body }, { a: P.nude, b: P.blush, c: mix(P.blush, P.wine, 0.3) }));
}

write('editorial/hero-main.svg', editorial(1200, 1500, { motif: 'wheel' }));
write('editorial/hero-detail.svg', editorial(700, 700, { motif: 'closeup', cols: ['#D9A5AE', '#9E1F36', '#E3C1B3'], tint: { a: P.nude, b: P.blush, c: mix(P.blush, P.wine, 0.25) } }));
write('editorial/edit-main.svg', editorial(1000, 1300, { motif: 'wheel', cols: CHROME.concat(['#D9A5AE', '#5E2433', '#C7B8E0', '#F1E6DF', '#9E1F36', '#E3C1B3']), tint: { a: P.ivory, b: P.blush, c: mix(P.blush, P.wine, 0.35) } }));
write('editorial/edit-detail.svg', editorial(800, 800, { motif: 'object', obj: O.crystals(), tint: { a: P.nude, b: P.blush, c: P.blush } }));
write('editorial/auth-login.svg', editorial(1000, 1400, { motif: 'wheel', tint: { a: P.blush, b: mix(P.blush, P.wine, 0.2), c: P.wine } }));
write('editorial/auth-register.svg', editorial(1000, 1400, { motif: 'closeup', cols: ['#E3C1B3', '#D9A5AE', '#5E2433'], tint: { a: P.nude, b: P.blush, c: mix(P.wine, P.blush, 0.4) } }));

console.log('listo');
