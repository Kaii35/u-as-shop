"""
Saca las fotos de docs/catalogo.pdf y las deja listas para la tienda.

    python scripts/exportar-fotos-catalogo.py

Lee server/prisma/catalogo-real.json: cada producto dice qué páginas del PDF
son suyas ('fotos'). Cada foto se guarda como
public/images/products/catalogo/<id>-<n>.webp (n empieza en 1, la primera es
la portada del producto). Las categorías usan su 'foto' como
public/images/categories/<id>.webp.

Se reduce a 900 × 1200 px: el PDF trae 1200 × 1600 y la tienda nunca las pinta
más grandes; así la carpeta pesa una fracción.

Requiere PyMuPDF y Pillow (pip install pymupdf pillow).
"""

import io
import json
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / 'docs' / 'catalogo.pdf'
DATA = ROOT / 'server' / 'prisma' / 'catalogo-real.json'
OUT_PRODUCTS = ROOT / 'public' / 'images' / 'products' / 'catalogo'
OUT_CATEGORIES = ROOT / 'public' / 'images' / 'categories'
MAX = (900, 1200)


def page_image(doc: fitz.Document, page: int) -> Image.Image:
    images = doc[page - 1].get_images(full=True)
    if not images:
        raise SystemExit(f'La página {page} del PDF no tiene foto.')
    raw = doc.extract_image(images[0][0])['image']
    img = Image.open(io.BytesIO(raw)).convert('RGB')
    img.thumbnail(MAX, Image.LANCZOS)
    return img


def main() -> None:
    data = json.loads(DATA.read_text(encoding='utf-8'))
    doc = fitz.open(PDF)
    OUT_PRODUCTS.mkdir(parents=True, exist_ok=True)

    # Limpia exportaciones viejas para que no queden fotos huérfanas.
    for old in OUT_PRODUCTS.glob('*.webp'):
        old.unlink()

    count = 0
    for product in data['productos']:
        for n, page in enumerate(product['fotos'], start=1):
            page_image(doc, page).save(OUT_PRODUCTS / f"{product['id']}-{n}.webp", 'WEBP', quality=80, method=6)
            count += 1

    for cat in data['categorias']:
        page_image(doc, cat['foto']).save(OUT_CATEGORIES / f"{cat['id']}.webp", 'WEBP', quality=80, method=6)

    size = sum(f.stat().st_size for f in OUT_PRODUCTS.glob('*.webp')) / 1_048_576
    print(f'{count} fotos de producto ({size:.1f} MB) y {len(data["categorias"])} de categoría.')


if __name__ == '__main__':
    main()
