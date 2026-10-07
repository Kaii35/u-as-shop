/**
 * Estilos compartidos por los informes en PDF.
 *
 * ---------------------------------------------------------------------------
 * Por qué estos informes NO usan la tipografía de la tienda
 * ---------------------------------------------------------------------------
 * La Bodoni Moda es la cara de la marca y funciona en la portada, donde un
 * titular ocupa media pantalla. En un documento denso no: es una Didone, y lo
 * que la hace bonita —el contraste brutal entre asta y filete— es justo lo que
 * la vuelve difícil a 10 u 11 puntos. Los filetes se adelgazan hasta casi
 * desaparecer al imprimir, y un informe está lleno de cifras, códigos y tablas
 * que se leen de un vistazo y no contemplando.
 *
 * Se usa IBM Plex Sans, que se diseñó para documentación técnica: abertura
 * grande, formas poco ambiguas donde más importa (la I mayúscula, la l
 * minúscula y el 1 se distinguen sin pensar) y una Mono hermana para códigos e
 * identificadores. Las cifras van en `tabular-nums`, así que las columnas de
 * dinero quedan alineadas por la coma sin trucos.
 *
 * La identidad se mantiene por el COLOR, que es donde de verdad vive: la
 * paleta es la misma de la tienda.
 */

export const FUENTES = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;

export const ESTILOS = `
  :root{
    --ink:#2A1215; --clay:#521317; --canvas:#fff; --sand:#F6EDEA;
    --line:#E8D8D3; --mist:#8A7270; --ok:#2F6B4F; --warn:#8F631C; --danger:#B3261E;
    --texto:#3F2A2C;
  }
  @page{ size:A4; margin:17mm 15mm 16mm; }
  *{ box-sizing:border-box; }
  body{
    margin:0; background:var(--canvas); color:var(--texto);
    font-family:"IBM Plex Sans",system-ui,sans-serif;
    font-size:10.5pt; line-height:1.55;
    font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
    -webkit-font-smoothing:antialiased;
  }
  .hoja{ max-width:186mm; margin:0 auto; padding:10mm 0; }

  h1,h2,h3{ font-weight:600; color:var(--ink); margin:0; letter-spacing:-.011em; }
  h1{ font-size:23pt; line-height:1.18; letter-spacing:-.02em; }
  h2{ font-size:14pt; margin:0 0 3.5mm; padding-bottom:2mm; border-bottom:1.5px solid var(--ink); }
  h3{ font-size:11pt; margin:0 0 1.5mm; }
  p{ margin:0 0 2.5mm; }
  strong{ font-weight:600; color:var(--ink); }
  section{ margin-bottom:9mm; }
  .salto{ break-before:page; }
  .evitar{ break-inside:avoid; }

  /* Portada */
  .portada{ border-bottom:3px solid var(--clay); padding-bottom:6mm; margin-bottom:7mm; }
  .marca{ font-size:8.5pt; font-weight:600; letter-spacing:.17em; text-transform:uppercase;
          color:var(--clay); margin-bottom:3.5mm; }
  .sub{ font-size:10.5pt; color:var(--mist); margin-top:2.5mm; }
  .meta{ display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; margin-top:6mm; }
  .meta div{ border-left:2px solid var(--line); padding-left:3mm; }
  .meta dt{ font-size:7pt; font-weight:600; text-transform:uppercase; letter-spacing:.1em;
            color:var(--mist); margin-bottom:1mm; }
  .meta dd{ margin:0; font-size:9.5pt; font-weight:500; color:var(--ink); }

  /* Marcadores */
  /* Tres columnas por defecto: olvidar el modificador apilaba las fichas en
     vertical y se comia media pagina sin que nada avisara. */
  .marcador{ display:grid; gap:4mm; margin:5mm 0; grid-template-columns:repeat(3,1fr); }
  .marcador.tres{ grid-template-columns:repeat(3,1fr); }
  .marcador.cuatro{ grid-template-columns:repeat(4,1fr); }
  .caja{ border:1.5px solid var(--line); border-radius:3px; padding:4mm 3mm; text-align:center; }
  .caja .n{ font-size:21pt; font-weight:600; line-height:1.1; display:block; color:var(--ink);
            letter-spacing:-.02em; }
  .caja .n.chico{ font-size:15pt; }
  .caja .l{ font-size:7.5pt; font-weight:500; text-transform:uppercase; letter-spacing:.08em;
            color:var(--mist); margin-top:1.5mm; }
  .caja.bien{ border-color:var(--ok); } .caja.bien .n{ color:var(--ok); }
  .caja.mal{ border-color:var(--danger); } .caja.mal .n{ color:var(--danger); }
  .caja.na .n{ color:var(--warn); }

  .destacado{ background:var(--sand); border-left:3px solid var(--clay); padding:4mm 5mm;
              margin:4mm 0; border-radius:0 3px 3px 0; }
  .destacado.alarma{ border-left-color:var(--danger); background:#FCEEEC; }
  .destacado p:last-child{ margin-bottom:0; }

  /* Tablas */
  table{ width:100%; border-collapse:collapse; font-size:8.8pt; }
  thead th{ text-align:left; font-size:7pt; font-weight:600; text-transform:uppercase;
            letter-spacing:.08em; color:var(--mist); border-bottom:1.5px solid var(--ink);
            padding:0 2mm 1.5mm; }
  tbody td{ border-bottom:1px solid var(--line); padding:2.2mm 2mm; vertical-align:top; }
  tbody tr{ break-inside:avoid; }
  th.num,td.num{ text-align:right; }
  td.id,.mono{ font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace; font-size:8pt;
               color:var(--mist); white-space:nowrap; }
  .nombre{ font-weight:600; color:var(--ink); margin-bottom:1mm; }
  .porque,.obs{ font-size:8.3pt; color:var(--texto); margin-top:1mm; }
  .rot{ font-size:6.8pt; font-weight:600; text-transform:uppercase; letter-spacing:.07em;
        color:var(--mist); margin-right:1.5mm; }
  td.res{ white-space:nowrap; font-weight:600; width:20mm; }
  .estado-PASA td.res,.ok{ color:var(--ok); }
  .estado-FALLA td.res,.mal{ color:var(--danger); }
  .estado-NO_APLICA td.res,.ojo{ color:var(--warn); }
  td.sev{ font-size:8pt; text-transform:capitalize; width:17mm; }
  .sev-critica{ color:var(--danger); font-weight:600; }
  .sev-alta{ color:var(--warn); font-weight:600; }

  .etq{ display:inline-block; font-size:7pt; font-weight:600; text-transform:uppercase;
        letter-spacing:.07em; padding:.7mm 1.8mm; border-radius:2px; white-space:nowrap; }
  .etq.v{ background:#E3F0E8; color:var(--ok); }
  .etq.r{ background:#FBE4E2; color:var(--danger); }
  .etq.a{ background:#FAF0DF; color:var(--warn); }
  .etq.g{ background:#EFEAE9; color:var(--mist); }

  /* Bloques */
  .capa,.hallazgo{ border:1px solid var(--line); border-radius:3px; padding:3.5mm 4mm;
                   margin-bottom:3mm; break-inside:avoid; }
  .hallazgo{ border-left:3px solid var(--clay); border-radius:0 3px 3px 0; padding:4mm 4.5mm;
             margin-bottom:4mm; }
  .hallazgo.abierto{ border-left-color:var(--danger); }
  .capa .cab,.hallazgo .cab{ display:flex; align-items:baseline; gap:3mm; margin-bottom:2mm;
                             justify-content:space-between; }
  .hallazgo .cab{ justify-content:flex-start; flex-wrap:wrap; }
  .capa .donde{ font-size:8pt; color:var(--mist); white-space:nowrap; }
  .capa .protege{ font-size:9pt; font-weight:500; color:var(--ink); margin-bottom:1.5mm; }
  .capa .como{ font-size:8.4pt; }
  .capa .refs{ font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace; font-size:7.3pt;
               color:var(--mist); margin-top:2mm; }
  .hallazgo .cod{ font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace; font-size:8.3pt;
                  color:var(--clay); font-weight:500; }
  .pill{ font-size:7pt; font-weight:600; text-transform:uppercase; letter-spacing:.07em;
         padding:.7mm 1.8mm; border-radius:2px; white-space:nowrap; }
  .pill.corregido{ background:#E3F0E8; color:var(--ok); }
  .pill.verificado{ background:var(--sand); color:var(--clay); }
  .pill.abierto{ background:#FBE4E2; color:var(--danger); }
  .hallazgo dl{ margin:0; font-size:8.8pt; }
  .hallazgo dt{ font-size:6.8pt; font-weight:600; text-transform:uppercase; letter-spacing:.07em;
                color:var(--mist); margin-top:2mm; }
  .hallazgo dd{ margin:.5mm 0 0; }
  .hallazgo .nota{ margin-top:2.5mm; padding-top:2mm; border-top:1px solid var(--line);
                   font-size:8.4pt; color:var(--clay); font-weight:500; }

  code{ font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace; font-size:8.4pt;
        background:var(--sand); padding:.4mm 1.2mm; border-radius:2px; color:var(--ink); }
  pre{ font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace; font-size:8pt;
       background:var(--sand); padding:3mm; border-radius:3px; overflow:hidden;
       margin:2mm 0; line-height:1.5; }
  .url{ display:block; font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace; font-size:8.3pt;
        background:var(--ink); color:#fff; padding:3mm; border-radius:3px; word-break:break-all;
        margin:2mm 0; }
  ol,ul{ margin:0 0 2.5mm; padding-left:5mm; }
  li{ margin-bottom:1.2mm; }
  .pie{ margin-top:8mm; padding-top:3mm; border-top:1px solid var(--line);
        font-size:7.8pt; color:var(--mist); }
`;

/** Pie de página con numeración, para `page.pdf()`. */
export const piePdf = (titulo: string): string =>
  `<div style="width:100%;font:7pt 'IBM Plex Sans',sans-serif;color:#8A7270;padding:0 15mm;display:flex;justify-content:space-between">` +
  `<span>${titulo}</span><span class="pageNumber"></span></div>`;

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Pesos colombianos sin decimales: el peso no tiene centavos. */
export const pesos = (centavos: number): string =>
  '$' + Math.round(centavos / 100).toLocaleString('es-CO');
