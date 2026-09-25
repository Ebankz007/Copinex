-- Provisions the test database on first container boot (docker-entrypoint-initdb.d).
-- Runs once, as the POSTGRES_USER. The vitest global-setup also auto-creates it
-- when missing, so this is belt-and-suspenders for compose-based environments.
CREATE DATABASE copinex_test OWNER copinex;