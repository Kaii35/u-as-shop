import { cn } from "@/lib/utils";
import { useRef, useState, useLayoutEffect } from "react";
import gsap from "gsap";

interface MenuItem {
  num: string;
  name: string;
  clipId: string;
  image: string;
  /** Opcional: destino al hacer clic. Sin él, el ítem no navega. */
  href?: string;
}

/**
 * Los tres clipId están cableados a los <clipPath> del SVG de abajo, así que el
 * componente admite exactamente tres ítems. Pasar más deja los extra sin máscara.
 */
const defaultItems: MenuItem[] = [
  {
    num: "01",
    name: "Esmaltes semipermanentes",
    clipId: "clip-original",
    image: "/images/collections/semipermanentes.jpg",
  },
  {
    num: "02",
    name: "Nail art y decoración",
    clipId: "clip-hexagons",
    image: "/images/collections/nail-art.jpg",
  },
  {
    num: "03",
    name: "Herramientas y equipos",
    clipId: "clip-pixels",
    image: "/images/collections/herramientas.jpg",
  },
];

/**
 * Parte el nombre en dos líneas por el hueco más cercano a la mitad.
 * El original hacía split(' ')[0] y [1], que con nombres de una sola palabra
 * imprimía "undefined" y con los de tres o más se comía el resto — y los
 * nuestros son "Nail art y decoración" o "Herramientas y equipos".
 */
function twoLines(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return [words[0], ""];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export const Component = ({
  items = defaultItems,
  className,
  onSelect,
}: { items?: MenuItem[]; className?: string; onSelect?: (item: MenuItem) => void }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<SVGImageElement>(null);
  const mainGroupRef = useRef<SVGGElement>(null);
  const masterTl = useRef<gsap.core.Timeline | null>(null);

  const createLoop = (index: number) => {
    const item = items[index];
    const root = containerRef.current;
    if (!root) return;
    // Selector acotado al contenedor: el original usaba uno global, así que dos
    // instancias en la misma página se animaban entre sí.
    const targets = root.querySelectorAll(`#${item.clipId} .path`);

    if (masterTl.current) masterTl.current.kill();

    if (imageRef.current) imageRef.current.setAttribute("href", item.image);
    if (mainGroupRef.current) mainGroupRef.current.setAttribute("clip-path", `url(#${item.clipId})`);

    gsap.set(targets, { scale: 0, transformOrigin: "50% 50%" });

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });

    // 1. IN (Expo Out)
    tl.to(targets, {
      scale: 1,
      duration: 0.8,
      stagger: { amount: 0.4, from: "random" },
      ease: "expo.out",
    })
      // 2. IDLE (Sine Breath)
      .to(targets, {
        scale: 1.05,
        duration: 1.5,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
        stagger: { amount: 0.2, from: "center" },
      })
      // 3. OUT (Expo In)
      .to(targets, {
        scale: 0,
        duration: 0.6,
        stagger: { amount: 0.3, from: "edges" },
        ease: "expo.in",
      });

    masterTl.current = tl;
  };

  useLayoutEffect(() => {
    // Con movimiento reducido el bucle infinito no se lanza: se deja la máscara
    // visible y quieta.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      if (reduce) {
        const root = containerRef.current;
        if (root) gsap.set(root.querySelectorAll(`#${items[0].clipId} .path`), { scale: 1, transformOrigin: "50% 50%" });
        return;
      }
      createLoop(0);
    }, containerRef);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleItemHover = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const item = items[index];
      if (imageRef.current) imageRef.current.setAttribute("href", item.image);
      if (mainGroupRef.current) mainGroupRef.current.setAttribute("clip-path", `url(#${item.clipId})`);
      return;
    }
    createLoop(index);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full flex-col items-center justify-between gap-8 overflow-hidden md:flex-row md:gap-12",
        className
      )}
    >
      {/* IZQUIERDA: menú */}
      <div className="z-20 w-full md:w-1/2">
        <nav>
          <ul className="flex flex-col gap-5 md:gap-7">
            {items.map((item, index) => {
              const [l1, l2] = twoLines(item.name);
              const active = activeIndex === index;
              return (
                <li key={item.num}>
                  <button
                    type="button"
                    onMouseEnter={() => handleItemHover(index)}
                    onFocus={() => handleItemHover(index)}
                    onClick={() => onSelect?.(item)}
                    aria-current={active}
                    className="group flex w-full cursor-pointer items-start gap-4 text-left"
                  >
                    <span
                      className={cn(
                        "tnum mt-1 text-cap font-semibold transition-colors duration-300",
                        active ? "text-clay" : "text-mist"
                      )}
                    >
                      {item.num}
                    </span>
                    <h3
                      className={cn(
                        "display text-h4 uppercase leading-[0.95] transition-all duration-500 md:text-h2",
                        active ? "translate-x-1.5 text-ink" : "translate-x-0 text-mist/60"
                      )}
                    >
                      {l1}
                      {l2 && <><br />{l2}</>}
                    </h3>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* DERECHA: máscara animada */}
      <div className="relative mt-2 flex w-full items-center justify-center md:mt-0 md:w-1/2">
        <div className="absolute h-[110%] w-[110%] rounded-full bg-clay/10 blur-[110px]" />

        <svg viewBox="0 0 500 500" className="z-10 h-auto w-full max-w-[420px]" role="img" aria-label="Vista previa de la colección">
          <defs>
            <clipPath id="clip-original">
              <path className="path" d="M480.6,235H19.4c-6,0-10.8-4.9-10.8-10.8v-9.5c0-6,4.9-10.8,10.8-10.8h461.1c6,0,10.8,4.9,10.8,10.8v9.5C491.4,230.2,486.6,235,480.6,235z" />
              <path className="path" d="M483.1,362.4H16.9c-4.6,0-8.3-3.7-8.3-8.3v-1.8c0-4.6,3.7-8.3,8.3-8.3h466.1c4.6,0,8.3,3.7,8.3,8.3v1.8C491.4,358.7,487.7,362.4,483.1,362.4z" />
              <path className="path" d="M460.3,336.3H39.7c-17.2,0-31.1-13.9-31.1-31.1v-31.5c0-17.2,13.9-31.1,31.1-31.1h420.7c17.2,0,31.1,13.9,31.1,31.1v31.5C491.4,322.4,477.5,336.3,460.3,336.3z" />
              <path className="path" d="M459.2,196.2H40.8v-35c0-47.5,38.5-86,86-86h246.5c47.5,0,86,38.5,86,86V196.2z" />
              <path className="path" d="M441.9,424.9H58.1c-9.6,0-17.3-7.8-17.3-17.3v-37.4h418.5v37.4C459.2,417.1,451.5,424.9,441.9,424.9z" />
            </clipPath>

            <clipPath id="clip-hexagons">
              <rect className="path" x="20" y="20" width="200" height="280" rx="12" />
              <rect className="path" x="20" y="320" width="200" height="160" rx="12" />
              <rect className="path" x="240" y="20" width="240" height="140" rx="12" />
              <rect className="path" x="240" y="180" width="110" height="160" rx="12" />
              <rect className="path" x="370" y="180" width="110" height="160" rx="12" />
              <rect className="path" x="240" y="360" width="240" height="120" rx="12" />
            </clipPath>

            <clipPath id="clip-pixels">
              {Array.from({ length: 9 }).map((_, i) => (
                <rect
                  key={i}
                  className="path"
                  x={(i % 3) * 160 + 20}
                  y={Math.floor(i / 3) * 160 + 20}
                  width="140"
                  height="140"
                  rx="4"
                />
              ))}
            </clipPath>
          </defs>

          <g ref={mainGroupRef} clipPath={`url(#${items[0].clipId})`}>
            <image
              ref={imageRef}
              href={items[0].image}
              width="500"
              height="500"
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        </svg>
      </div>
    </div>
  );
};
