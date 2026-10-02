/**
 * Comprobacion del sistema de temas.
 *
 *     npm run theme:check
 *
 * El modo oscuro de este proyecto funciona porque los colores son variables
 * CSS: `text-ink` o `bg-sand` cambian de tema solos. Eso tiene una condicion
 * fragil — que NADIE escriba un color fuera del sistema. Un `bg-white` o un
 * `#FFFFFF` incrustado no se entera del tema y se queda blanco sobre carbon, y
 * esos fallos no los ve el compilador: no aparecen hasta que alguien abre la
 * pagina en oscuro.
 *
 * Este guion los busca. No sustituye a mirar la pantalla, pero evita que
 * vuelvan a colarse sin que nadie se entere.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.argv[2] ?? 'src';
const EXT = new Set(['.ts', '.tsx']);

/** Archivos donde un color literal SI esta justificado, con su motivo. */
const PERMITIDOS = new Map([
  ['src/lib/theme.ts', 'define los dos temas: necesita los hex de la barra del navegador'],
  ['src/components/ui/ThemeToggle.tsx', 'es el control del tema'],
  [
    'src/data/catalog.ts',
    'los tonos de esmalte son datos del producto: un "Rose Silk" es ese rosa en los dos temas',
  ],
]);

/**
 * Escape de una sola linea.
 *
 * Hay un caso que ninguna regla automatica puede juzgar: texto blanco sobre
 * FOTOGRAFIA con un velo oscuro encima. Ahi el blanco es correcto en los dos
 * temas, porque debajo no hay una superficie del sistema sino una imagen.
 * Se marca en la propia linea, y con el motivo escrito:
 *
 *     // tema-ok: va sobre foto con velo oscuro en los dos temas
 *     <div className="text-white">
 *
 * La marca cubre su propia linea y las ALCANCE siguientes, porque lo normal es
 * explicarlo en el comentario de encima y no ensuciar el JSX con un comentario
 * al final de cada atributo.
 *
 * Exigir el motivo importa: un escape sin explicacion es el que alguien copia
 * a la linea siguiente sin pensar.
 */
const ESCAPE = /\btema-ok:\s*\S/;
const ALCANCE = 6;

function archivos(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (EXT.has(ruta.slice(ruta.lastIndexOf('.')))) salida.push(ruta);
  }
  return salida;
}

const hallazgos = [];
const anotar = (archivo, linea, texto, regla, nota) =>
  hallazgos.push({ archivo, linea, texto: texto.trim().slice(0, 100), regla, nota });

for (const ruta of archivos(RAIZ)) {
  const rel = relative('.', ruta).replace(/\\/g, '/');
  if (PERMITIDOS.has(rel)) continue;

  let enBloque = false;
  /** Lineas que quedan cubiertas por la ultima marca `tema-ok:` vista. */
  let cubiertas = 0;

  readFileSync(ruta, 'utf8')
    .split('\n')
    .forEach((linea, i) => {
      const n = i + 1;
      if (ESCAPE.test(linea)) {
        cubiertas = ALCANCE;
        return;
      }
      if (cubiertas > 0) {
        cubiertas -= 1;
        return;
      }

      /*
         Los comentarios citan colores constantemente: documentan por que un
         token vale y otro no. Hay que descontarlos o el guion se llena de
         falsos positivos y deja de leerse. Los de bloque abarcan varias
         lineas, asi que hace falta arrastrar el estado de una a la siguiente.
      */
      let codigo = linea;
      if (enBloque) {
        const cierre = codigo.indexOf('*/');
        if (cierre === -1) return; // la linea entera va dentro del comentario
        enBloque = false;
        codigo = codigo.slice(cierre + 2);
      }
      codigo = codigo.replace(/\/\*.*?\*\//g, '');
      const abre = codigo.indexOf('/*');
      if (abre !== -1) {
        enBloque = true;
        codigo = codigo.slice(0, abre);
      }
      codigo = codigo.replace(/\/\/.*$/, '');

      if (/\bbg-white\b/.test(codigo)) {
        anotar(rel, n, linea, 'bg-white', 'usa bg-surface, bg-canvas (pagina) o bg-canvas-sunk (pagina hundida)');
      }
      if (/\bborder-white\b/.test(codigo)) {
        anotar(rel, n, linea, 'border-white', 'usa border-line, o marca la linea con "tema-ok: <motivo>"');
      }
      if (/\btext-white\b/.test(codigo)) {
        /*
           El blanco NO se salva por ir sobre clay, ok, warn o danger: esos
           cuatro rellenos se aclaran en oscuro y el blanco encima cae a
           2,0-3,0:1. Esta medido. Para ellos existe `text-on-accent`.
        */
        anotar(
          rel,
          n,
          linea,
          'text-white',
          'sobre bg-ink -> text-on-ink · sobre bg-slab -> text-on-slab · sobre clay/ok/warn/danger -> text-on-accent',
        );
      }
      const hex = codigo.match(/#[0-9A-Fa-f]{6}\b/g);
      if (hex) {
        anotar(rel, n, linea, `hex ${hex.join(', ')}`, 'un hex no sabe en que tema esta: usa un token o rgb(var(--x))');
      }
    });
}

// ---------------------------------------------------------------------------

if (hallazgos.length === 0) {
  console.log('\nTema: ningun color fuera del sistema.\n');
  process.exit(0);
}

console.log('\nColores que no siguen el tema\n');
let actual = '';
for (const h of hallazgos) {
  if (h.archivo !== actual) {
    actual = h.archivo;
    console.log(`  ${actual}`);
  }
  console.log(`    ${String(h.linea).padStart(4)}  ${h.regla}`);
  console.log(`          ${h.texto}`);
  console.log(`          -> ${h.nota}`);
}

const porRegla = new Map();
for (const h of hallazgos) {
  const clave = h.regla.startsWith('hex') ? 'hex' : h.regla;
  porRegla.set(clave, (porRegla.get(clave) ?? 0) + 1);
}
console.log('\nResumen');
for (const [regla, n] of [...porRegla].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${regla}`);
}
console.log(`\n  ${hallazgos.length} en total.`);
console.log(
  '\n  Si alguno es correcto a proposito, marca la linea con un comentario\n' +
    '  "tema-ok: <motivo>", para que la proxima persona no lo deshaga.\n',
);
process.exit(1);
