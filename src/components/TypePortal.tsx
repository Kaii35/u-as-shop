import { useEffect, useRef, useState, type ReactNode } from 'react';
import GlyphPortal from '@/components/ui/glyph-portal';
import { Img } from './ui/Primitives';

/**
 * Portal tipográfico: una palabra en Bodoni por la que la página entra, con la
 * cámara guiada por el scroll, hasta caer dentro de la franja oscura.
 *
 * Envuelve a `glyph-portal` y resuelve las dos cosas que ese componente no
 * puede resolver solo: con qué tipografía monta y qué pasa si no la tiene.
 */

/** El nombre suelto, para preguntarle al navegador si ya tiene la cara. */
const FAMILIA_NOMBRE = 'Bodoni Moda';
/**
 * La pila completa. Si la Bodoni no estuviera, el componente detecta que falta
 * una de las familias pedidas y se queda quieto en vez de animar con otra letra
 * distinta a la de la marca.
 */
const FAMILIA = `"${FAMILIA_NOMBRE}", Georgia, serif`;
/**
 * 700 y no 900. El `<link>` de index.html pide la Bodoni hasta 700, y el
 * componente comprueba la cara con `document.fonts.check('<peso> 100px ...')`:
 * pedir 900 daría `false`, el componente concluiría que la tipografía no está
 * y caería a Arial Black, que es justo lo que no queremos.
 */
const PESO = 700;

/**
 * Cuánto se espera a la tipografía antes de rendirse, en ms.
 *
 * Pasado ese plazo la decisión queda tomada PARA SIEMPRE en esta carga. Es
 * deliberado: si se permitiera cambiar de opinión al llegar la fuente tarde, la
 * sección pasaría de una franja de altura normal a un portal de dos pantallas
 * con el visitante ya scrolleando, y le movería la página bajo el dedo.
 *
 * El plazo es holgado porque la cuenta no empieza al cargar la página sino al
 * acercarse la sección (ver `useCerca`), y para entonces la Bodoni lleva rato
 * disponible. Es una válvula de seguridad, no una carrera.
 */
const VENTANA = 2500;

/**
 * A qué distancia se despierta la sección, en pantallas.
 *
 * Esto no es una optimización, es lo que hace que el efecto exista. Montado al
 * cargar la página, el portal mide y arranca en el peor momento: durante la
 * carga el hilo principal está ocupado, su primer fotograma llega tarde y el
 * propio componente se declara `stalled` y se queda quieto para siempre. Medido
 * en un Chromium real sobre esta portada, montándolo al cargar salía
 * `data-gp-motion="off"` en escritorio: el portal estaba, pero no se movía.
 *
 * Despertándolo a dos pantallas de distancia llega con el hilo libre y las
 * fuentes ya resueltas. Dos pantallas también evitan el salto de maquetación:
 * cuando la sección crece, crece muy por debajo de lo que se está mirando.
 */
const CERCANIA = '200% 0px';

type Decision = 'esperando' | 'portal' | 'plano';

/** `true` cuando la sección se acerca a la pantalla. Una sola vez, sin volver atrás. */
function useCerca(ancla: { current: HTMLElement | null }): boolean {
  const [cerca, setCerca] = useState(false);

  useEffect(() => {
    if (cerca) return;
    const nodo = ancla.current;
    if (!nodo) return;
    if (typeof IntersectionObserver === 'undefined') {
      setCerca(true);
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setCerca(true);
          observador.disconnect();
        }
      },
      { rootMargin: CERCANIA },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [cerca, ancla]);

  return cerca;
}

/** `true` si la Bodoni ya está disponible en este mismo instante. */
function yaEsta(): boolean {
  try {
    return document.fonts?.check(`${PESO} 100px "${FAMILIA_NOMBRE}"`) ?? false;
  } catch {
    return false;
  }
}

function useDecision(texto: string, activo: boolean): Decision {
  const [decision, setDecision] = useState<Decision>('esperando');

  useEffect(() => {
    if (!activo || decision !== 'esperando') return;
    // Lo normal, al despertarse ya con la sección cerca, es que la Bodoni lleve
    // rato cargada: la usan los titulares de las secciones de arriba. Entonces
    // se decide aquí mismo, sin pasar por un fotograma intermedio.
    if (yaEsta()) {
      setDecision('portal');
      return;
    }
    if (!document.fonts) {
      setDecision('plano');
      return;
    }

    let vivo = true;
    const resolver = (valor: Decision): void => {
      if (!vivo) return;
      vivo = false;
      window.clearTimeout(tope);
      setDecision(valor);
    };
    const tope = window.setTimeout(() => resolver('plano'), VENTANA);

    document.fonts.load(`${PESO} 100px "${FAMILIA_NOMBRE}"`, texto).then(
      // Si la familia no está declarada, `load` resuelve con una lista vacía en
      // vez de rechazar: hay que mirar el resultado, no solo que no falle.
      (caras) => resolver(caras.length > 0 ? 'portal' : 'plano'),
      () => resolver('plano'),
    );

    return () => {
      vivo = false;
      window.clearTimeout(tope);
    };
  }, [activo, decision, texto]);

  return decision;
}

/**
 * Lo que se ve por el hueco de las letras y, al final del recorrido, el fondo
 * del panel. Es una fotografía y no un color plano por una razón medida.
 *
 * Con relleno plano el efecto solo funcionaba en claro. El marco de apertura es
 * `canvas` y el relleno era `slab`: en claro eso es vino sobre blanco, un
 * contraste de 6:1; en oscuro son 26-16-18 contra 18-11-12, dos negros casi
 * iguales, y la palabra desaparecía. Se comprobó en capturas reales. Y no hay
 * arreglo dentro de la paleta: en oscuro todo lo que es «oscuro» está a un pelo
 * del fondo de página, y lo único legible sería un relleno claro, que de noche
 * convierte la sección en una linterna.
 *
 * Una foto es lo único que mantiene tono medio en los DOS temas.
 */
const FOTO = '/images/collections/nail-art.jpg';

/**
 * El fondo, en dos velos.
 *
 * El segundo cuelga de `--gp-reveal`, que el propio componente publica al
 * entrar: la foto se queda clara mientras lo que importa es que la PALABRA se
 * lea recortada sobre la página, y se oscurece justo cuando aparece el TEXTO
 * del panel, que necesita lo contrario. Un solo velo no puede servir a los dos:
 * en oscuro, el que deja leer la palabra deja el párrafo en 2,9:1.
 */
function Fondo() {
  return (
    // El leve zoom del campo durante el tránsito. Lo hacía el fondo por defecto
    // del componente, que aquí se sustituye; sin esto el viaje pierde la
    // sensación de profundidad y la foto queda clavada detrás de las letras.
    <div className="absolute inset-0" style={{ transform: 'scale(var(--gp-field-scale, 1))' }}>
      {/*
         Desenfocada, y no por estética. A foco la luminancia de la foto varía
         mucho de un lado a otro del encuadre, y como cada letra recorta un
         trozo distinto, unas letras se leían y otras no: medido en oscuro daba
         2,4:1 de mediana y 1,57:1 en las peores zonas, con el listón en 3:1.
         El desenfoque colapsa esa varianza y deja un tono parejo, así que
         TODAS las letras tienen el mismo contraste. El `scale-110` evita que
         el difuminado de los bordes deje ver el borde del encuadre.
      */}
      <Img src={FOTO} alt="" photo className="scale-110 blur-2xl" />
      {/* Velo base. Pesa menos en oscuro: ahí la foto compite contra un fondo
          de página casi negro, no contra blanco. */}
      <div className="absolute inset-0 bg-slab/80 dark:bg-slab/25" />
      <div
        className="absolute inset-0 bg-slab/70"
        style={{ opacity: 'var(--gp-reveal, 0)' }}
      />
    </div>
  );
}

export interface TypePortalProps {
  /** La palabra del portal. En versales: la Bodoni tiene más cuerpo ahí. */
  word: string;
  /**
   * La letra por la que entra la cámara.
   *
   * Conviene fijarla. Sin esto el componente elige el cuadrado opaco más grande
   * de la palabra, y en una Didone como la Bodoni ese cuadrado no cae en el asta
   * sino en el remate: medido sobre la fuente real, en «NATALIA» elige la barra
   * de la T y en «Natalia» elige el punto de la i.
   */
  focusChar?: string;
  /** Línea corta sobre la palabra, en el marco de apertura. */
  eyebrow?: string;
  /** Texto del enlace que salta al panel sin tener que scrollear. */
  enterLabel?: string;
  /** Recorrido en pantallas. Menos recorrido, menos peaje de scroll. */
  scrollLength?: number;
  /** El contenido del panel al que se entra. */
  children: ReactNode;
}

export function TypePortal({
  word,
  focusChar,
  eyebrow,
  enterLabel = 'Entrar',
  scrollLength = 2,
  children,
}: TypePortalProps) {
  const ancla = useRef<HTMLElement | null>(null);
  const cerca = useCerca(ancla);
  const decision = useDecision(word, cerca);

  // El mismo envoltorio en las dos ramas: el contenido se alinea con el resto
  // de la página en lugar de heredar el relleno propio del componente, que es
  // un 7% del ancho y dejaría estas tarjetas más estrechas que las de arriba.
  const cuerpo = <div className="container-x section-y">{children}</div>;

  /*
     Franja normal hasta que la sección se acerca, mientras se espera la
     tipografía, y para siempre si no llega. Es también lo que ve quien pide
     menos animación y quien tiene el JavaScript desactivado, así que todos esos
     casos acaban en la misma sección tranquila en vez de en comportamientos
     distintos, y la sección nunca queda vacía esperando a nada.
  */
  if (decision !== 'portal') {
    return <section ref={ancla} className="bg-slab text-on-slab">{cuerpo}</section>;
  }

  return (
    <GlyphPortal
      word={word}
      {...(focusChar ? { focusChar } : {})}
      fontFamily={FAMILIA}
      fontWeight={PESO}
      scrollLength={scrollLength}
      enterLabel={enterLabel}
      // El marco de apertura es `canvas`, no la franja: lo que se ve al llegar
      // es la página de siempre con la palabra recortada, y por el hueco de las
      // letras asoma aquello a lo que se entra.
      style={{ '--gp-content-padding': '0' }}
      background={<Fondo />}
      {...(eyebrow
        ? {
            front: (
              <p
                className="absolute inset-x-6 m-0 text-center text-meta font-semibold uppercase tracking-[.14em] text-clay"
                // Anclado al borde superior de la palabra, que el componente
                // publica ya medido: con un porcentaje fijo se solaparía con la
                // letra en cuanto cambiara la altura de la ventana.
                style={{ bottom: 'calc(100% - var(--gp-word-top, 38%) + 24px)' }}
              >
                {eyebrow}
              </p>
            ),
          }
        : {})}
    >
      {cuerpo}
    </GlyphPortal>
  );
}
