ALTER TABLE members ADD COLUMN available_hours REAL
	CHECK (available_hours IS NULL OR available_hours BETWEEN 0 AND 168);
