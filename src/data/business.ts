/**
 * Datos legales y de contacto del negocio. Única fuente: el pie de página,
 * las políticas y los enlaces de WhatsApp leen de aquí. Si algo cambia
 * (dirección, número, correo), se cambia solo en este archivo.
 */
export const BUSINESS = {
  name: 'Natalia Sánchez',
  nit: '1036604105',
  email: 'nataliasancheztu@gmail.com',
  /** Como se muestra. */
  whatsapp: '311 350 7700',
  /** Con indicativo de Colombia y sin espacios, para wa.me. */
  whatsappIntl: '573113507700',
  address: '31 Sur # 51-30, local 143',
  mall: 'Centro Comercial Ruiseñor',
  city: 'Caldas, Antioquia',
  country: 'Colombia',
  hours: 'Lunes a sábado · 8:00 a. m. – 7:00 p. m.',
} as const;

export const fullAddress = `${BUSINESS.address}, ${BUSINESS.mall}, ${BUSINESS.city}, ${BUSINESS.country}`;

export const whatsappUrl = (text?: string) =>
  `https://wa.me/${BUSINESS.whatsappIntl}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Páginas legales, en el orden en que se listan. El slug es la ruta /legal/<slug>. */
export const LEGAL_PAGES = [
  { slug: 'terminos', label: 'Términos y condiciones' },
  { slug: 'privacidad', label: 'Política de privacidad y datos personales' },
  { slug: 'cookies', label: 'Política de cookies' },
  { slug: 'envios', label: 'Envíos y entregas' },
  { slug: 'cambios', label: 'Cambios, devoluciones y garantías' },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]['slug'];
