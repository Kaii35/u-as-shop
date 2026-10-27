/**
 * Logos de marca en /images/brands, por slug. Masglo, Cristal Style, Vive
 * Beauty, Beauty Plus y The Rose Beauty son los oficiales de sus sitios web.
 * Ópalo, ILÚ y Roniki no publican el suyo: están redibujados desde las fotos
 * del catálogo; si la marca manda el archivo oficial, basta con reemplazarlo.
 *
 * El orden es el de "más buscadas", que es como se muestran en portada.
 */
export const BRAND_LOGOS: Array<{ slug: string; file: string }> = [
  { slug: 'masglo', file: 'masglo.svg' },
  { slug: 'opalo', file: 'opalo.png' },
  { slug: 'cristal-style', file: 'cristal-style.png' },
  { slug: 'vive-beauty', file: 'vive-beauty.png' },
  { slug: 'beauty-plus', file: 'beauty-plus.png' },
  { slug: 'ilu', file: 'ilu.png' },
  { slug: 'the-rose-beauty', file: 'the-rose-beauty.png' },
  { slug: 'roniki', file: 'roniki.png' },
];

export const brandLogoSrc = (slug: string) => {
  const hit = BRAND_LOGOS.find((b) => b.slug === slug);
  return hit ? `/images/brands/${hit.file}` : undefined;
};
