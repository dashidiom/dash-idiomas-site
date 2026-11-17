-- Autorizações opcionais marcadas na matrícula (LGPD): 1 = autorizou, 0 = não autorizou
ALTER TABLE enrollments ADD COLUMN autoriza_imagem INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN autoriza_marketing INTEGER NOT NULL DEFAULT 0;
