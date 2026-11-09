-- Dónde se muestra una promoción, además del pop-up.
ALTER TABLE "promotions" ADD COLUMN "showSlider" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "promotions" ADD COLUMN "showBanner" BOOLEAN NOT NULL DEFAULT false;
