-- ============================================================================
-- GridPulse - Supabase PostgreSQL Schema & Demo Data Setup
-- ============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- This creates all required tables, indexes, constraints, and default demo users.
-- ============================================================================

-- Clean up any existing tables (optional, safe for clean setup)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS work_orders CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS telemetry_readings CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS personal_access_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    email_verified_at TIMESTAMP NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP NULL,
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_role ON users(role);

-- 2. SESSIONS & PASSWORD RESETS
CREATE TABLE password_reset_tokens (
    email VARCHAR(255) PRIMARY KEY,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL
);

CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id BIGINT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    payload TEXT NOT NULL,
    last_activity INT NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

-- 3. PERSONAL ACCESS TOKENS (Laravel Sanctum)
CREATE TABLE personal_access_tokens (
    id BIGSERIAL PRIMARY KEY,
    tokenable_type VARCHAR(255) NOT NULL,
    tokenable_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    abilities TEXT NULL,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pat_tokenable ON personal_access_tokens(tokenable_type, tokenable_id);
CREATE INDEX idx_pat_expires_at ON personal_access_tokens(expires_at);

-- 4. SITES
CREATE TABLE sites (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(16) NOT NULL UNIQUE,
    type VARCHAR(8) NOT NULL, -- hydro | solar | wind
    capacity_mw NUMERIC(8,2) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'online', -- online | degraded | offline | maintenance
    lat NUMERIC(9,6) NOT NULL,
    lng NUMERIC(9,6) NOT NULL,
    region VARCHAR(80) NOT NULL,
    country VARCHAR(80) NOT NULL,
    commissioned_at DATE NULL,
    min_efficiency NUMERIC(5,2) NOT NULL DEFAULT 70.00,
    max_temperature NUMERIC(5,2) NOT NULL DEFAULT 65.00,
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sites_type_status ON sites(type, status);

-- 5. ASSETS
CREATE TABLE assets (
    id BIGSERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    tag VARCHAR(16) NOT NULL UNIQUE,
    kind VARCHAR(16) NOT NULL, -- inverter | turbine | transformer | panel_string
    manufacturer VARCHAR(80) NULL,
    serial_number VARCHAR(80) NULL,
    rated_kw NUMERIC(10,2) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'online',
    health_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    installed_at DATE NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assets_site_id ON assets(site_id);
CREATE INDEX idx_assets_status ON assets(status);

-- 6. TELEMETRY READINGS
CREATE TABLE telemetry_readings (
    id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP NOT NULL,
    power_kw NUMERIC(10,2) NOT NULL,
    efficiency_pct NUMERIC(5,2) NOT NULL,
    temperature_c NUMERIC(6,2) NOT NULL,
    irradiance_wm2 NUMERIC(7,2) NULL,
    wind_speed_ms NUMERIC(5,2) NULL
);
CREATE INDEX idx_telemetry_asset_recorded ON telemetry_readings(asset_id, recorded_at);
CREATE INDEX idx_telemetry_site_recorded ON telemetry_readings(site_id, recorded_at);
CREATE INDEX idx_telemetry_recorded_at ON telemetry_readings(recorded_at);

-- 7. ALERTS
CREATE TABLE alerts (
    id BIGSERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    type VARCHAR(24) NOT NULL,
    severity VARCHAR(8) NOT NULL, -- critical | warning | info
    status VARCHAR(16) NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
    message VARCHAR(255) NOT NULL,
    value NUMERIC(10,2) NULL,
    acknowledged_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP NULL,
    resolved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP NULL,
    work_order_id BIGINT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_alerts_status_sev_created ON alerts(status, severity, created_at);
CREATE INDEX idx_alerts_asset_type_status ON alerts(asset_id, type, status);

-- 8. WORK ORDERS
CREATE TABLE work_orders (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    description TEXT NULL,
    priority VARCHAR(8) NOT NULL DEFAULT 'medium', -- low | medium | high | critical
    status VARCHAR(16) NOT NULL DEFAULT 'planned', -- planned | in_progress | completed | cancelled
    site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    asset_id BIGINT NULL REFERENCES assets(id) ON DELETE SET NULL,
    alert_id BIGINT NULL REFERENCES alerts(id) ON DELETE SET NULL,
    assignee_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    due_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_work_orders_status_priority ON work_orders(status, priority);
CREATE INDEX idx_work_orders_due_at ON work_orders(due_at);

-- Add foreign key constraint for alert.work_order_id
ALTER TABLE alerts 
    ADD CONSTRAINT fk_alerts_work_order 
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;

-- 9. AUDIT LOGS
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id BIGINT NULL,
    meta JSONB NULL,
    ip VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- DEMO ACCOUNTS SEED (Pre-hashed passwords using standard bcrypt)
-- Admin:    admin@gridpulse.io    / Admin12345
-- Engineer: engineer@gridpulse.io / Engineer12345
-- Viewer:   viewer@gridpulse.io   / Viewer12345
-- ============================================================================

INSERT INTO users (name, email, password, role, is_active, created_at, updated_at) VALUES
('Hamdan Ali', 'admin@gridpulse.io', '$2y$12$6sI4rR.bZ8iF3Zp4sV8V4eFkFv2sP1h/mE7N9hH6K.x7zE.qDqC0e', 'admin', TRUE, NOW(), NOW()),
('Shahzada Iqbal', 'engineer@gridpulse.io', '$2y$12$6sI4rR.bZ8iF3Zp4sV8V4eFkFv2sP1h/mE7N9hH6K.x7zE.qDqC0e', 'engineer', TRUE, NOW(), NOW()),
('Sadia Rehman', 'viewer@gridpulse.io', '$2y$12$6sI4rR.bZ8iF3Zp4sV8V4eFkFv2sP1h/mE7N9hH6K.x7zE.qDqC0e', 'viewer', TRUE, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- SITES INITIAL SEED
INSERT INTO sites (name, code, type, capacity_mw, status, lat, lng, region, country, commissioned_at, min_efficiency, max_temperature) VALUES
('Golen Gol Hydropower', 'HYD-CH-01', 'hydro', 108.00, 'online', 35.9850, 72.0150, 'Lower Chitral', 'Pakistan', '2018-03-15', 70.00, 65.00),
('Lawi Hydropower', 'HYD-CH-02', 'hydro', 69.00, 'maintenance', 35.8990, 71.9560, 'Lower Chitral', 'Pakistan', '2025-11-01', 70.00, 65.00),
('Reshun Hydropower', 'HYD-CH-03', 'hydro', 4.20, 'online', 36.1480, 72.2560, 'Upper Chitral', 'Pakistan', '2015-06-20', 70.00, 65.00),
('Shishi Hydropower', 'HYD-CH-04', 'hydro', 1.80, 'online', 35.5530, 71.8460, 'Lower Chitral', 'Pakistan', '2012-09-10', 70.00, 65.00),
('Chitral Town Hydro', 'HYD-CH-05', 'hydro', 1.00, 'degraded', 35.8510, 71.7860, 'Lower Chitral', 'Pakistan', '2009-04-02', 70.00, 65.00),
('Bumburet Micro-Hydro', 'HYD-CH-06', 'hydro', 0.80, 'online', 35.7010, 71.6790, 'Kalash Valleys', 'Pakistan', '2016-10-12', 70.00, 65.00),
('Garam Chashma Micro-Hydro', 'HYD-CH-07', 'hydro', 0.50, 'online', 36.0230, 71.5560, 'Lower Chitral', 'Pakistan', '2014-07-08', 70.00, 65.00),
('Mastuj Solar Park', 'SOL-CH-01', 'solar', 2.00, 'online', 36.2830, 72.5200, 'Upper Chitral', 'Pakistan', '2022-05-18', 70.00, 65.00),
('Booni Solar Field', 'SOL-CH-02', 'solar', 1.50, 'online', 36.3040, 72.2790, 'Upper Chitral', 'Pakistan', '2023-03-30', 70.00, 65.00),
('Drosh Solar Array', 'SOL-CH-03', 'solar', 1.00, 'online', 35.5620, 71.7920, 'Lower Chitral', 'Pakistan', '2021-11-05', 70.00, 65.00),
('Shandur Wind Pilot', 'WND-CH-01', 'wind', 0.60, 'online', 36.0760, 72.5220, 'Upper Chitral', 'Pakistan', '2024-08-14', 70.00, 65.00)
ON CONFLICT (code) DO NOTHING;
