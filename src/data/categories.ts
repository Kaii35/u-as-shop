import type { Category, CategoryId } from '../types';

export const categories: Category[] = [
  {
    id: 'unas-manicura',
    name: 'Uñas y manicura',
    description: 'Bases, limas, top coats y todo para una manicura impecable.',
    copy: {
      description: 'Fórmula autonivelante de alta adherencia, pensada para el trabajo diario en cabina. Mantiene el brillo y la flexibilidad hasta por tres semanas sin levantamientos.',
      usage: 'Prepara la uña, deshidrata y aplica una capa fina. Cura 60 s en LED o 120 s en UV.',
    },
  },
  {
    id: 'semipermanentes',
    name: 'Esmaltes semipermanentes',
    description: 'Color de larga duración con acabado de salón.',
    copy: {
      description: 'Pigmentación intensa desde la primera capa, textura cremosa y nivelación impecable. Acabado de salón que dura hasta 21 días con el cuidado adecuado.',
      usage: 'Sobre base curada, aplica dos capas finas curando 60 s LED cada una. Sella con top coat.',
    },
  },
  {
    id: 'gel-acrilico-polygel',
    name: 'Gel, acrílico y polygel',
    description: 'Construcción y esculpido para extensiones perfectas.',
    copy: {
      description: 'Viscosidad media que permite esculpir sin escurrir. Ideal para extensiones, nivelación y refuerzo de uña natural.',
      usage: 'Aplica con pincel o espátula, modela la curva C y cura 60–90 s en LED. Lima y sella.',
    },
  },
  {
    id: 'nail-art',
    name: 'Nail art y decoración',
    description: 'Foils, pigmentos, cristales y pinceles de detalle.',
    copy: {
      description: 'Detalles que transforman un diseño. Materiales seleccionados para precisión, brillo y fijación duradera.',
      usage: 'Aplica sobre capa de gel sin curar o con adhesivo específico. Sella con top coat no-wipe.',
    },
  },
  {
    id: 'herramientas',
    name: 'Herramientas y equipos',
    description: 'Lámparas, tornos e instrumental profesional.',
    copy: {
      description: 'Equipo de uso profesional con componentes de alta durabilidad y garantía oficial de 12 meses.',
      usage: 'Lee el manual antes del primer uso. Limpia y desinfecta después de cada servicio.',
    },
  },
  {
    id: 'pestanas-cejas',
    name: 'Pestañas y cejas',
    description: 'Extensiones, lifting y diseño de mirada.',
    copy: {
      description: 'Fibras suaves de alta calidad que conservan la curva, ligeras y cómodas para la clienta.',
      usage: 'Aísla la pestaña natural, aplica adhesivo en punto y fija a 1 mm del párpado.',
    },
  },
  {
    id: 'manos-pies',
    name: 'Cuidado de manos y pies',
    description: 'Tratamientos, exfoliantes y rituales spa.',
    copy: {
      description: 'Ingredientes nutritivos que restauran la piel y cutículas después de cada servicio. Textura ligera de rápida absorción.',
      usage: 'Masajea sobre piel limpia hasta su completa absorción. Úsalo a diario.',
    },
  },
  {
    id: 'maquillaje',
    name: 'Maquillaje y cosmética',
    description: 'Fórmulas profesionales para piel y rostro.',
    copy: {
      description: 'Cobertura modulable con acabado natural y larga duración para trabajos de maquillaje profesional.',
      usage: 'Aplica con brocha o esponja húmeda desde el centro del rostro hacia afuera.',
    },
  },
  {
    id: 'accesorios',
    name: 'Accesorios profesionales',
    description: 'Organización, protección e higiene para tu estación.',
    copy: {
      description: 'Diseñado para mantener tu estación ordenada, limpia y lista para cada clienta.',
      usage: 'Limpia con paño húmedo y alcohol isopropílico. Evita solventes fuertes.',
    },
  },
];

export const getCategory = (id: CategoryId | string) => categories.find((c) => c.id === id);
