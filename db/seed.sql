-- Seed Data for SRSMS (Kerala - Kochi Region)

-- Admin User
INSERT INTO users (email, password_hash, first_name, last_name)
VALUES ('admin@srsms.gov', 'placeholder', 'Admin', 'User')
ON CONFLICT DO NOTHING;

-- District
INSERT INTO districts (id, name, geometry)
VALUES (1, 'Ernakulam (Kochi)', ST_GeomFromText('MULTIPOLYGON(((76.200 9.900, 76.400 9.900, 76.400 10.100, 76.200 10.100, 76.200 9.900)))', 4326))
ON CONFLICT DO NOTHING;

-- Roads
INSERT INTO roads (id, name, road_class, district_id) VALUES 
(1, 'MG Road', 'Arterial', 1),
(2, 'Marine Drive', 'Local', 1),
(3, 'SA Road', 'Arterial', 1),
(4, 'NH 66 (Edapally Bypass)', 'Highway', 1)
ON CONFLICT DO NOTHING;

-- Segments (LineStrings in Kochi, Kerala)
INSERT INTO road_segments (id, road_id, geometry, length_meters, speed_limit, lane_count) VALUES 
(1, 1, ST_GeomFromText('LINESTRING(76.282 9.970, 76.283 9.975)', 4326), 500, 40, 4), -- MG Road South
(2, 1, ST_GeomFromText('LINESTRING(76.283 9.975, 76.285 9.985)', 4326), 1100, 40, 4), -- MG Road North
(3, 2, ST_GeomFromText('LINESTRING(76.273 9.975, 76.275 9.985)', 4326), 1100, 30, 2), -- Marine Drive
(4, 3, ST_GeomFromText('LINESTRING(76.285 9.965, 76.300 9.970)', 4326), 1600, 40, 4), -- SA Road
(5, 4, ST_GeomFromText('LINESTRING(76.305 10.020, 76.315 10.035)', 4326), 1900, 60, 6) -- NH 66
ON CONFLICT DO NOTHING;

-- Infrastructure Data
INSERT INTO infrastructure_data (segment_id, pedestrian_crossing, sidewalk, lighting, signage, traffic_signal) VALUES 
(1, true, true, true, true, true),
(2, false, true, false, true, false), -- Deficient
(3, true, true, true, true, false),
(4, false, false, false, false, false), -- Very Deficient
(5, true, false, true, true, true)
ON CONFLICT DO NOTHING;

-- Speed Data (Simulated overspeeding on SA Road and NH 66)
INSERT INTO speed_data (segment_id, date, average_speed, percentile_85_speed) VALUES 
(1, '2026-06-15', 30, 35),
(2, '2026-06-15', 38, 45), -- Speeding
(3, '2026-06-15', 25, 28),
(4, '2026-06-15', 55, 65), -- Heavy Speeding (Limit 40)
(5, '2026-06-15', 75, 85); -- Speeding (Limit 60)

-- Traffic Data
INSERT INTO traffic_data (segment_id, date, traffic_volume, heavy_vehicle_mix, car_mix, motorcycle_mix) VALUES 
(1, '2026-06-15', 25000, 0.05, 0.65, 0.30),
(2, '2026-06-15', 28000, 0.08, 0.62, 0.30),
(3, '2026-06-15', 15000, 0.01, 0.70, 0.29),
(4, '2026-06-15', 45000, 0.20, 0.50, 0.30), -- High traffic, high heavy
(5, '2026-06-15', 85000, 0.25, 0.60, 0.15);

-- Accidents
-- MG Road
INSERT INTO accidents (accident_id, segment_id, geometry, date, severity, fatalities) VALUES 
('K001', 1, ST_GeomFromText('POINT(76.2825 9.972)', 4326), '2026-01-10', 'Minor', 0),
('K002', 2, ST_GeomFromText('POINT(76.284 9.980)', 4326), '2026-02-15', 'Serious', 0),
('K003', 2, ST_GeomFromText('POINT(76.2845 9.982)', 4326), '2026-03-20', 'Fatal', 1);

-- SA Road (Very high risk)
INSERT INTO accidents (accident_id, segment_id, geometry, date, severity, fatalities) VALUES 
('K004', 4, ST_GeomFromText('POINT(76.290 9.967)', 4326), '2026-04-10', 'Fatal', 2),
('K005', 4, ST_GeomFromText('POINT(76.292 9.968)', 4326), '2026-04-12', 'Serious', 0),
('K006', 4, ST_GeomFromText('POINT(76.295 9.969)', 4326), '2026-05-01', 'Serious', 0),
('K007', 4, ST_GeomFromText('POINT(76.291 9.9675)', 4326), '2026-05-15', 'Fatal', 1);

-- NH 66
INSERT INTO accidents (accident_id, segment_id, geometry, date, severity, fatalities) VALUES 
('K008', 5, ST_GeomFromText('POINT(76.310 10.025)', 4326), '2026-06-01', 'Minor', 0);

-- Default AHP Profile (Standard Road Safety Literature Weights)
INSERT INTO ahp_profiles (profile_name, description, pairwise_matrix, derived_weights, consistency_ratio, is_consistent, is_active)
VALUES (
    'MoRTH Standard',
    'Default weighting based on Indian road safety literature. Prioritizes crash history and VRU exposure.',
    '{"matrix": [[1, 2, 3, 3, 1, 5], [0.5, 1, 2, 2, 0.5, 3], [0.333, 0.5, 1, 1, 0.333, 2], [0.333, 0.5, 1, 1, 0.333, 2], [1, 2, 3, 3, 1, 5], [0.2, 0.333, 0.5, 0.5, 0.2, 1]], "criteria": ["accident", "speed", "traffic", "infrastructure", "vru", "geometry"]}',
    '{"accident": 0.30, "speed": 0.15, "traffic": 0.10, "infrastructure": 0.10, "vru": 0.30, "geometry": 0.05}',
    0.032,
    true,
    true
);

-- VRU Exposure Data
INSERT INTO vru_exposure (segment_id, school_proximity_count, hospital_proximity_count, poi_proximity_count, pedestrian_volume_estimate, two_wheeler_mix, sidewalk_present, crossing_present, vru_exposure_score, vru_risk_category) VALUES
(1, 2, 1, 5, 850, 0.30, true, true, 62.0, 'High'),
(2, 0, 0, 2, 400, 0.30, true, false, 35.0, 'Moderate'),
(3, 1, 2, 4, 1200, 0.29, true, true, 72.0, 'High'),
(4, 0, 0, 1, 200, 0.30, false, false, 85.0, 'Very High'),
(5, 0, 0, 0, 100, 0.15, false, true, 45.0, 'Moderate');

-- Star Ratings
INSERT INTO star_ratings (segment_id, star_rating, star_category, infrastructure_sub, speed_management_sub, crash_history_sub, vru_protection_sub, srs_score) VALUES
(1, 4, '4-Star (Good)', 90, 85, 70, 65, 76.5),
(2, 2, '2-Star (Poor)', 40, 55, 35, 60, 44.0),
(3, 3, '3-Star (Average)', 80, 90, 75, 45, 68.5),
(4, 1, '1-Star (Critical)', 0, 15, 10, 15, 10.0),
(5, 3, '3-Star (Average)', 60, 50, 85, 55, 62.5);
