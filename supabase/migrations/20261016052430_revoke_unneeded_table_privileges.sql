-- Remove unnecessary privileges from client-facing roles
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- Prevent those privileges from being granted by default
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
IN SCHEMA public
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
ON TABLES
FROM anon, authenticated;