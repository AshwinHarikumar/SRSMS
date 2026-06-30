import requests
import psycopg2

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DB_DSN = "postgresql://srsms_user:srsms_password@db:5432/srsms"

OVERPASS_QUERY = """
[out:json][timeout:90];
area["name"="Ernakulam"]->.searchArea;
(
  node["amenity"~"hospital|school|police"](area.searchArea);
);
out geom;
"""

def fetch_pois():
    print("Fetching POIs from Overpass API...")
    headers = {'User-Agent': 'SRSMSMapApp/1.0 (contact@srsms.gov)'}
    try:
        response = requests.post(OVERPASS_URL, data={'data': OVERPASS_QUERY}, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Overpass API failed: {e}. Falling back to synthetic POIs.")
        return generate_synthetic_pois()

def generate_synthetic_pois():
    elements = []
    base_lat, base_lon = 9.98, 76.28
    amenities = ['hospital', 'school', 'police']
    import random
    for i in range(15):
        elements.append({
            'type': 'node',
            'tags': {
                'name': f"City {random.choice(amenities).capitalize()} {i}",
                'amenity': random.choice(amenities)
            },
            'lat': base_lat + random.uniform(-0.05, 0.05),
            'lon': base_lon + random.uniform(-0.05, 0.05)
        })
    return {'elements': elements}

def insert_pois(data):
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    
    try:
        cur.execute("TRUNCATE TABLE pois CASCADE;")
        
        count = 0
        for element in data.get('elements', []):
            if element['type'] == 'node':
                tags = element.get('tags', {})
                name = tags.get('name', 'Unknown')
                amenity = tags.get('amenity', 'unknown').capitalize()
                lat = element.get('lat')
                lon = element.get('lon')
                
                cur.execute("""
                    INSERT INTO pois (name, type, geometry)
                    VALUES (%s, %s, ST_GeomFromText(%s, 4326))
                """, (name, amenity, f"POINT({lon} {lat})"))
                count += 1
                
        conn.commit()
        print(f"Successfully inserted {count} POIs into database.")
    except Exception as e:
        conn.rollback()
        print(f"Database error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    data = fetch_pois()
    insert_pois(data)
