-- Data de nascimento do aluno (AAAA-MM-DD). Matrículas antigas ficam sem valor.
ALTER TABLE enrollments ADD COLUMN data_nascimento TEXT;
