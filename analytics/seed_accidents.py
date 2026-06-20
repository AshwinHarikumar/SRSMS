import os
import psycopg2
from psycopg2.extras import execute_batch
import random
from datetime import datetime, timedelta
import uuid

DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@srsms_db:5432/srsms")

def seed_accidents():
    print("Connecting to DB to seed Accidents...")
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    # Get random road segments to act as "Hotspots" and normal roads
    cur.execute("""
        SELECT id, ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry))
        FROM road_segments
        ORDER BY RANDOM()
        LIMIT 4000;
    """)
    segments = cur.fetchall()

    if not segments:
        print("No segments found.")
        return

    # First 1,000 will be extreme "Black Spots"
    hotspots = segments[:1000]
    # Remaining 3,000 will be normal roads
    normal_roads = segments[1000:]

    data_tuples = []
    
    severities = ['Fatal', 'Serious', 'Minor', 'Damage Only']
    
    print("Generating Hotspot crashes (Massive Fatalities)...")
    for seg_id, lon, lat in hotspots:
        # Hotspots get 5-15 crashes in 3 years
        num_crashes = random.randint(5, 15)
        for _ in range(num_crashes):
            # Heavy bias towards Fatal/Serious
            severity = random.choices(severities, weights=[0.4, 0.4, 0.1, 0.1])[0]
            
            # Fatalities
            fatalities = random.randint(1, 3) if severity == 'Fatal' else 0
            injuries = random.randint(1, 5) if severity in ['Fatal', 'Serious', 'Minor'] else 0
            
            # Date (last 3 years)
            days_ago = random.randint(1, 3 * 365)
            crash_date = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')
            crash_time = f"{random.randint(0,23):02d}:{random.randint(0,59):02d}:00"
            
            # Geometry slightly offset from centroid
            c_lon = lon + random.uniform(-0.001, 0.001)
            c_lat = lat + random.uniform(-0.001, 0.001)
            geom_wkt = f"POINT({c_lon} {c_lat})"
            
            acc_id = f"SYN-BS-{uuid.uuid4().hex[:8]}"
            
            data_tuples.append((acc_id, seg_id, crash_date, crash_time, geom_wkt, severity, fatalities, injuries))

    print("Generating Normal crashes...")
    for seg_id, lon, lat in normal_roads:
        # Normal roads get 1-3 crashes
        num_crashes = random.randint(1, 3)
        for _ in range(num_crashes):
            # Bias towards minor
            severity = random.choices(severities, weights=[0.05, 0.1, 0.4, 0.45])[0]
            
            fatalities = random.randint(1, 2) if severity == 'Fatal' else 0
            injuries = random.randint(1, 2) if severity in ['Fatal', 'Serious', 'Minor'] else 0
            
            days_ago = random.randint(1, 3 * 365)
            crash_date = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')
            crash_time = f"{random.randint(0,23):02d}:{random.randint(0,59):02d}:00"
            
            c_lon = lon + random.uniform(-0.001, 0.001)
            c_lat = lat + random.uniform(-0.001, 0.001)
            geom_wkt = f"POINT({c_lon} {c_lat})"
            
            acc_id = f"SYN-NR-{uuid.uuid4().hex[:8]}"
            
            data_tuples.append((acc_id, seg_id, crash_date, crash_time, geom_wkt, severity, fatalities, injuries))

    print(f"Inserting {len(data_tuples)} Synthetic Crashes into database...")
    
    # Optional: Clear existing synthetic accidents
    cur.execute("TRUNCATE TABLE accidents RESTART IDENTITY CASCADE;")
    
    query = """
        INSERT INTO accidents (accident_id, segment_id, date, time, geometry, severity, fatalities, injuries)
        VALUES (%s, %s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s, %s)
    """
    execute_batch(cur, query, data_tuples, page_size=5000)
    
    conn.commit()
    cur.close()
    conn.close()
    print("Successfully seeded Accidents!")

if __name__ == "__main__":
    seed_accidents()
