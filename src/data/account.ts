import type { Address, Order, Review } from '../types';

export const demoOrders: Order[] = [
  {
    number: 'AU-10482', date: '12 sep 2026', productIds: ['p1', 'p11', 'p6'], total: 187600, status: 'En camino',
    tracking: [
      { label: 'Pedido confirmado', date: '12 sep · 10:24', done: true },
      { label: 'Preparando tu pedido', date: '12 sep · 15:02', done: true },
      { label: 'En camino · Servientrega 70423118', date: '13 sep · 08:40', done: true },
      { label: 'Entregado', date: 'Estimado 16 sep', done: false },
    ],
  },
  {
    number: 'AU-10311', date: '28 ago 2026', productIds: ['p3', 'p5'], total: 278700, status: 'Entregado',
    tracking: [
      { label: 'Pedido confirmado', date: '28 ago', done: true },
      { label: 'Preparando tu pedido', date: '28 ago', done: true },
      { label: 'En camino', date: '29 ago', done: true },
      { label: 'Entregado', date: '31 ago', done: true },
    ],
  },
  {
    number: 'AU-10107', date: '02 ago 2026', productIds: ['p8', 'p13', 'p9', 'p16'], total: 152600, status: 'Entregado',
    tracking: [
      { label: 'Pedido confirmado', date: '02 ago', done: true },
      { label: 'Preparando tu pedido', date: '02 ago', done: true },
      { label: 'En camino', date: '03 ago', done: true },
      { label: 'Entregado', date: '05 ago', done: true },
    ],
  },
];

export const demoAddresses: Address[] = [
  { label: 'Estudio', line1: 'Carrera 43A # 7-50, local 204', line2: 'El Poblado · Medellín, Antioquia', primary: true },
  { label: 'Casa', line1: 'Calle 10 Sur # 32-15, apto 1102', line2: 'Envigado, Antioquia' },
];

export const demoReviews: Review[] = [
  { name: 'Laura M.', role: 'Nail artist · Medellín', stars: 5, date: 'Hace 2 semanas', title: 'Pigmentación increíble', text: 'Cubre en dos capas finas y nivela solo. Mis clientas lo llevan tres semanas sin levantamientos.' },
  { name: 'Daniela R.', role: 'Manicurista · Bogotá', stars: 5, date: 'Hace 1 mes', title: 'Ya es parte de mi estación', text: 'Cura rápido en lámpara LED y el color es idéntico a la muestra. El envío llegó en dos días.' },
  { name: 'Camila T.', role: 'Clienta verificada · Cali', stars: 4, date: 'Hace 1 mes', title: 'Muy buen acabado', text: 'Me encanta el tono. Le pondría cinco estrellas si trajera un pincel un poco más delgado.' },
];

export const ratingDistribution = [
  { stars: 5, pct: 78 },
  { stars: 4, pct: 15 },
  { stars: 3, pct: 5 },
  { stars: 2, pct: 1 },
  { stars: 1, pct: 1 },
];
