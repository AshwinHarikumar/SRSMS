import os
import psycopg2
from psycopg2.extras import execute_batch
import random

DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@srsms_db:5432/srsms")

def seed_pois():
    print("Connecting to DB to seed POIs...")
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    # Get random road segments to attach POIs near
    cur.execute("""
        SELECT id, ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry))
        FROM road_segments
        ORDER BY RANDOM()
        LIMIT 5000;  -- 5,000 roads will get POIs
    """)
    segments = cur.fetchall()

    if not segments:
        print("No segments found.")
        return

    print(f"Generating synthetic POIs near {len(segments)} road segments...")
    
    # Types of POIs
    poi_types = ['School', 'Hospital', 'Clinic', 'College', 'Kindergarten', 'Pharmacy']
    
    data_tuples = []
    
    for seg_id, lon, lat in segments:
        # Generate 1-4 POIs near this segment
        num_pois = random.randint(1, 4)
        for _ in range(num_pois):
            p_type = random.choice(poi_types)
            p_name = f"Kerala {p_type} {random.randint(100, 9999)}"
            
            # Offset lat/lon slightly (roughly within 100-200m)
            # 1 degree is ~111km, so 0.001 is ~111m
            p_lon = lon + random.uniform(-0.0015, 0.0015)
            p_lat = lat + random.uniform(-0.0015, 0.0015)
            
            geom_wkt = f"POINT({p_lon} {p_lat})"
            
            data_tuples.append((p_name, p_type, geom_wkt))

    print(f"Inserting {len(data_tuples)} POIs into the database...")
    
    # Optional: Clear existing synthetic POIs
    cur.execute("TRUNCATE TABLE pois RESTART IDENTITY CASCADE;")
    
    query = """
        INSERT INTO pois (name, type, geometry)
        VALUES (%s, %s, ST_GeomFromText(%s, 4326))
    """
    execute_batch(cur, query, data_tuples, page_size=5000)
    
    conn.commit()
    cur.close()
    conn.close()
    print("Successfully seeded POIs!")

if __name__ == "__main__":
    seed_pois()
