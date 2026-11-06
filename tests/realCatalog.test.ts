/**
 * Prueba del catálogo estático. Corre con el runner de Node, sin dependencias:
 *
 *   npm test
 *
 * Node ejecuta el TypeScript quitando los tipos, por eso el import lleva `.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapRealCatalog, type RawCatalog } from '../src/data/realCatalog.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const raw = JSON.parse(readFileSync(`${root}server/prisma/catalogo-real.json`, 'utf-8')) as RawCatalog;

const sample = (): RawCatalog => ({
  usos: { gel: 'Cura en lámpara.' },
  categorias: [{ id: 'ns-geles', nombre: 'Geles, bases y esmaltes', descripcion: 'Geles.' }],
  productos: [
    {
      id: 'ns-cepillo', nombre: 'Cepillo para uñas', marca: 'Línea profesional', cat: 'ns-geles',
      contenido: '1 unidad', fotos: [1, 2], uso: 'gel', desc: 'Cepillo.', precio: 1600,
      tonos: [['Azul', '#3B8BE0']], opciones: [['Pequeño', 1600], ['Grande', 3000]],
    },
    { id: 'ns-tips', nombre: 'Tips Soft Gel', marca: 'Aplauss', cat: 'ns-geles', contenido: '500 tips', fotos: [3], uso: 'gel', desc: 'Tips.', tallas: ['S', 'M'] },
  ],
});

test('mapea un producto con la forma pública de la API', () => {
  const { categories, brands, products } = mapRealCatalog(sample());
  assert.deepEqual(categories, [{ id: 'ns-geles', slug: 'geles-bases-y-esmaltes', name: 'Geles, bases y esmaltes', description: 'Geles.', image: '/images/categories/ns-geles.webp' }]);
  assert.deepEqual(brands.map((b) => b.name), ['Aplauss', 'Línea profesional']);
  const [cepillo, tips] = products;
  assert.equal(cepillo.slug, 'cepillo-para-unas');
  assert.equal(cepillo.ref, 'CEPILLO');
  assert.equal(cepillo.price, 1600);
  assert.deepEqual(cepillo.sizes, [{ label: 'Pequeño', price: 1600 }, { label: 'Grande', price: 3000 }]);
  assert.deepEqual(cepillo.shades, [{ name: 'Azul', hex: '#3B8BE0' }]);
  assert.deepEqual(cepillo.images, ['/images/products/catalogo/ns-cepillo-1.webp', '/images/products/catalogo/ns-cepillo-2.webp']);
  assert.equal(cepillo.usage, 'Cura en lámpara.');
  assert.equal(tips.price, 0, 'sin precio queda "por confirmar"');
  assert.deepEqual(tips.sizes, [{ label: 'S' }, { label: 'M' }]);
  assert.equal(tips.shades, undefined);
  assert.ok(!('cost' in cepillo), 'no expone el costo');
});

test('lanza ante datos inconsistentes en vez de devolver un catálogo a medias', () => {
  const badCat = sample();
  badCat.productos[0].cat = 'ns-nada';
  assert.throws(() => mapRealCatalog(badCat), /categoría/);
  const badUso = sample();
  badUso.productos[0].uso = 'nada';
  assert.throws(() => mapRealCatalog(badUso), /uso/);
  const dup = sample();
  dup.productos[1].nombre = dup.productos[0].nombre;
  assert.throws(() => mapRealCatalog(dup), /repetido/);
  assert.throws(() => mapRealCatalog({ usos: {}, categorias: [], productos: [] }), /vacío/);
});

test('el catálogo real completo mapea y todas sus fotos existen', () => {
  const { categories, products } = mapRealCatalog(raw);
  assert.equal(products.length, raw.productos.length);
  assert.equal(categories.length, raw.categorias.length);
  for (const c of categories) assert.ok(existsSync(`${root}public${c.image}`), `falta ${c.image}`);
  for (const p of products) {
    for (const img of p.images) assert.ok(existsSync(`${root}public${img}`), `falta ${img}`);
    if (p.sizes?.some((s) => s.price)) {
      const lowest = Math.min(...p.sizes.map((s) => s.price ?? Infinity));
      assert.equal(p.price, lowest, `${p.id}: el precio base debe ser el menor de sus opciones`);
    }
  }
});
