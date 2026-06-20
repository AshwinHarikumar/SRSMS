import requests
import json
import psycopg2
import random
import time

OVERPASS_URL = "http://overpass-api.de/api/interpreter"
DB_DSN = "postgresql://srsms_user:srsms_password@srsms_db:5432/srsms"

# Query for Major Highways in Kerala
OVERPASS_QUERY = """
[out:json][timeout:300][bbox:8.1,74.8,12.8,77.5];
(
  way["highway"~"motorway|trunk|primary|secondary"];
);
out geom;
"""

def fetch_osm_data():
    print("Reading OSM Data from OSM_KERALA.json...")
    try:
        import json
        with open('OSM_KERALA.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Failed to read local JSON: {e}. Falling back to synthetic roads.")
        return generate_synthetic_osm_data()

def generate_synthetic_osm_data():
    elements = []
    # Bounding box roughly for Kerala: 8.1, 74.8 to 12.8, 77.5
    for i in range(500):
        # Generate points roughly along Kerala's diagonal shape to avoid the ocean
        start_lat = random.uniform(8.2, 12.7)
        # Interpolate longitude based on latitude (Kerala slopes NW to SE)
        center_lon = 77.0 - (start_lat - 8.2) * 0.45
        # Add random width (Kerala is narrow)
        start_lon = center_lon + random.uniform(-0.3, 0.25)
        
        end_lat = start_lat + random.uniform(-0.01, 0.01)
        end_lon = start_lon + random.uniform(-0.01, 0.01)
        elements.append({
            'type': 'way',
            'tags': {
                'name': f"Kerala State Highway {i}",
                'highway': random.choice(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
            },
            'geometry': [
                {'lat': start_lat, 'lon': start_lon},
                {'lat': end_lat, 'lon': end_lon}
            ]
        })
    return {'elements': elements}

def process_and_insert(osm_data):
    print(f"Parsing {len(osm_data.get('elements', []))} OSM ways...")
    
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    try:
        # 1. Fetch Max IDs to append instead of truncate
        cur.execute("SELECT COALESCE(MAX(id), 0) FROM roads;")
        road_id_counter = cur.fetchone()[0] + 1
        
        cur.execute("SELECT COALESCE(MAX(id), 0) FROM road_segments;")
        segment_id_counter = cur.fetchone()[0] + 1

        cur.execute("SELECT COALESCE(COUNT(*), 0) FROM accidents;")
        accident_id_counter = cur.fetchone()[0] + 1
        # Insert a default District for Kerala
        cur.execute("""
            INSERT INTO districts (id, name, geometry) 
            VALUES (1, 'State of Kerala', ST_GeomFromText('POLYGON((74.8 8.0, 77.5 8.0, 77.5 12.8, 74.8 12.8, 74.8 8.0))', 4326))
            ON CONFLICT DO NOTHING;
        """)
        
        for element in osm_data.get('elements', []):
            if element['type'] == 'way' and 'geometry' in element:
                tags = element.get('tags', {})
                road_name = tags.get('name', tags.get('ref', f"Unnamed {tags.get('highway', 'Road')}"))
                road_class = tags.get('highway', 'unknown').capitalize()
                
                # Default speed limit based on highway type
                speed_limit = 60
                if 'motorway' in road_class.lower(): speed_limit = 80
                elif 'trunk' in road_class.lower(): speed_limit = 70
                
                # Parse geometry
                coords = [(pt['lon'], pt['lat']) for pt in element['geometry']]
                if len(coords) < 2:
                    continue
                
                linestring = f"LINESTRING({','.join([f'{lon} {lat}' for lon, lat in coords])})"
                
                # 2. Insert Road
                cur.execute("""
                    INSERT INTO roads (id, name, road_class, district_id) 
                    VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING;
                """, (road_id_counter, road_name, road_class, 1))
                
                # 3. Insert Segment
                # Generate a random length (mocked since ST_Length(geom::geography) can calculate it later)
                length_meters = random.randint(500, 5000)
                lane_count = random.randint(2, 6)
                
                cur.execute("""
                    INSERT INTO road_segments (id, road_id, geometry, length_meters, speed_limit, lane_count)
                    VALUES (%s, %s, ST_GeomFromText(%s, 4326), %s, %s, %s)
                """, (segment_id_counter, road_id_counter, linestring, length_meters, speed_limit, lane_count))
                
                # 4. Generate Synthetic Risk Data
                
                # Infrastructure (20% chance of being heavily deficient)
                is_deficient = random.random() < 0.2
                cur.execute("""
                    INSERT INTO infrastructure_data (segment_id, pedestrian_crossing, sidewalk, lighting, signage, traffic_signal)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (segment_id_counter, not is_deficient, not is_deficient, not is_deficient, True, not is_deficient))
                
                # Speed Data (15% chance of severe speeding)
                is_speeding = random.random() < 0.15
                avg_speed = speed_limit + (random.randint(10, 25) if is_speeding else random.randint(-15, 0))
                p85_speed = avg_speed + random.randint(5, 10)
                cur.execute("""
                    INSERT INTO speed_data (segment_id, date, average_speed, percentile_85_speed)
                    VALUES (%s, CURRENT_DATE, %s, %s)
                """, (segment_id_counter, avg_speed, p85_speed))
                
                # Traffic Data
                vol = random.randint(5000, 80000)
                cur.execute("""
                    INSERT INTO traffic_data (segment_id, date, traffic_volume, heavy_vehicle_mix, car_mix, motorcycle_mix)
                    VALUES (%s, CURRENT_DATE, %s, 0.15, 0.60, 0.25)
                """, (segment_id_counter, vol))
                
                # Accidents (Higher probability if deficient or speeding)
                num_accidents = 0
                if is_deficient and is_speeding:
                    num_accidents = random.randint(1, 4)
                elif is_speeding or is_deficient:
                    num_accidents = random.randint(0, 2)
                elif random.random() < 0.05:
                    num_accidents = 1
                
                for _ in range(num_accidents):
                    # Pick a random point along the coordinate array for the accident
                    pt = random.choice(coords)
                    severity = random.choices(['Minor', 'Serious', 'Fatal'], weights=[60, 30, 10])[0]
                    fatalities = random.randint(1, 3) if severity == 'Fatal' else 0
                    
                    cur.execute("""
                        INSERT INTO accidents (accident_id, segment_id, geometry, date, severity, fatalities)
                        VALUES (%s, %s, ST_GeomFromText(%s, 4326), CURRENT_DATE - (random() * 365)::int, %s, %s)
                    """, (f"OSM-A{accident_id_counter}", segment_id_counter, f"POINT({pt[0]} {pt[1]})", severity, fatalities))
                    accident_id_counter += 1

                segment_id_counter += 1
                road_id_counter += 1
                
        conn.commit()
        print(f"Successfully inserted {segment_id_counter - 1} road segments and {accident_id_counter - 1} accidents!")
        
    except Exception as e:
        conn.rollback()
        print(f"Database error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    try:
        data = fetch_osm_data()
        process_and_insert(data)
    except Exception as e:
        print(f"Failed: {e}")
