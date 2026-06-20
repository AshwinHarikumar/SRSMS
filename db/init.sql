-- Enable PostGIS and pgRouting extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- 1. AUTHENTICATION & RBAC
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id INT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. GIS DATA MANAGEMENT

CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    geometry geometry(MULTIPOLYGON, 4326)
);
CREATE INDEX districts_geom_idx ON districts USING GIST (geometry);

CREATE TABLE roads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    road_class VARCHAR(100),
    district_id INT REFERENCES districts(id) ON DELETE SET NULL
);

CREATE TABLE road_segments (
    id SERIAL PRIMARY KEY,
    road_id INT REFERENCES roads(id) ON DELETE CASCADE,
    geometry geometry(LINESTRING, 4326) NOT NULL,
    length_meters FLOAT,
    speed_limit INT,
    lane_count INT,
    width FLOAT,
    curvature FLOAT,
    gradient FLOAT,
    shoulder_width FLOAT
);
CREATE INDEX road_segments_geom_idx ON road_segments USING GIST (geometry);

CREATE TABLE accidents (
    id SERIAL PRIMARY KEY,
    accident_id VARCHAR(100) UNIQUE NOT NULL,
    segment_id INT REFERENCES road_segments(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    time TIME,
    geometry geometry(POINT, 4326) NOT NULL,
    severity VARCHAR(50) NOT NULL, -- Fatal, Serious, Minor, Damage Only
    fatalities INT DEFAULT 0,
    injuries INT DEFAULT 0,
    vehicle_type VARCHAR(100),
    collision_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX accidents_geom_idx ON accidents USING GIST (geometry);
CREATE INDEX accidents_date_idx ON accidents(date);

CREATE TABLE traffic_data (
    id SERIAL PRIMARY KEY,
    segment_id INT REFERENCES road_segments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    traffic_volume INT,
    heavy_vehicle_mix FLOAT,
    car_mix FLOAT,
    motorcycle_mix FLOAT,
    peak_hour_volume INT
);
CREATE INDEX traffic_data_segment_idx ON traffic_data(segment_id);

CREATE TABLE speed_data (
    id SERIAL PRIMARY KEY,
    segment_id INT REFERENCES road_segments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    average_speed FLOAT,
    percentile_85_speed FLOAT,
    maximum_speed FLOAT,
    violation_count INT
);
CREATE INDEX speed_data_segment_idx ON speed_data(segment_id);

CREATE TABLE infrastructure_data (
    id SERIAL PRIMARY KEY,
    segment_id INT REFERENCES road_segments(id) ON DELETE CASCADE UNIQUE,
    pedestrian_crossing BOOLEAN DEFAULT FALSE,
    sidewalk BOOLEAN DEFAULT FALSE,
    lighting BOOLEAN DEFAULT FALSE,
    signage BOOLEAN DEFAULT FALSE,
    guardrail BOOLEAN DEFAULT FALSE,
    traffic_signal BOOLEAN DEFAULT FALSE
);

-- 3. RISK ASSESSMENT & PRIORITY INDEX

CREATE TABLE risk_scores (
    id SERIAL PRIMARY KEY,
    segment_id INT REFERENCES road_segments(id) ON DELETE CASCADE UNIQUE,
    accident_score FLOAT DEFAULT 0,
    speed_score FLOAT DEFAULT 0,
    traffic_score FLOAT DEFAULT 0,
    infrastructure_score FLOAT DEFAULT 0,
    geometry_score FLOAT DEFAULT 0,
    weather_score FLOAT DEFAULT 0,
    predicted_risk FLOAT DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE priority_indices (
    id SERIAL PRIMARY KEY,
    segment_id INT REFERENCES road_segments(id) ON DELETE CASCADE UNIQUE,
    composite_pi FLOAT DEFAULT 0,
    priority_category VARCHAR(50), -- Low Risk, Moderate Risk, High Risk, Critical Risk
    color_code VARCHAR(20), -- Green, Yellow, Orange, Red
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recommendations (
    id SERIAL PRIMARY KEY,
    segment_id INT REFERENCES road_segments(id) ON DELETE CASCADE,
    category VARCHAR(100), -- High Speed, Pedestrian Risk, Junction Risk, Lighting Deficiency
    recommended_action TEXT,
    ai_confidence FLOAT,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Reviewed, Implemented
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Roles
INSERT INTO roles (name, description) VALUES 
('System Administrator', 'Can manage users, settings, and upload data'),
('Road Safety Analyst', 'Can view maps, analyze hotspots, generate reports'),
('Transport Planner', 'Can view rankings and review interventions'),
('District Officer', 'Can access district-level data'),
('Public Viewer', 'Can view public safety maps');

CREATE TABLE IF NOT EXISTS weather_data (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    temperature_2m FLOAT,
    precipitation FLOAT,
    visibility FLOAT,
    wind_speed_10m FLOAT,
    weather_code INT,
    overall_weather_risk_score FLOAT DEFAULT 0
);
