-- El carrusel se cambia por una franja de texto arriba de la tienda.
ALTER TABLE "promotions" RENAME COLUMN "showSlider" TO "showBar";
ALTER TABLE "promotions" ADD COLUMN "barText" TEXT;
