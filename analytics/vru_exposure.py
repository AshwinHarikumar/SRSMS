"""
VRU (Vulnerable Road User) Exposure Index
==========================================
Calculates a composite VRU exposure score for each road segment based on:
- Proximity to schools, hospitals, and other POIs (within 200m)
- Pedestrian/two-wheeler traffic mix
- Infrastructure protection (sidewalks, crossings)
"""

from sqlalchemy.orm import Session
from sqlalchemy import text

# Distance threshold for POI proximity analysis
PROXIMITY_RADIUS_M = 200

# Weight factors for different POI types
SCHOOL_WEIGHT = 3.0       # Schools generate high pedestrian traffic (children)
HOSPITAL_WEIGHT = 2.5     # Hospitals have high VRU activity (elderly, patients)
OTHER_POI_WEIGHT = 1.0    # Generic POIs contribute moderately

# Penalty multipliers
NO_SIDEWALK_PENALTY = 1.5     # 50% higher exposure if no sidewalk
NO_CROSSING_PENALTY = 1.3     # 30% higher if no pedestrian crossing
HIGH_2W_MIX_THRESHOLD = 0.25  # Two-wheeler mix above 25% increases VRU risk


def calculate_vru_exposure(db: Session):
    """
    Calculate VRU exposure index for all road segments using BULK processing.
    """
    print("Calculating VRU (Vulnerable Road User) Exposure Index (BULK MODE)...")

    # Step 1: Bulk calculate all parameters using PostgreSQL Spatial JOINs
    query = text("""
        WITH poi_counts AS (
            SELECT 
                rs.id as segment_id,
                COUNT(p.id) FILTER (WHERE LOWER(p.type) LIKE '%school%') as school_count,
                COUNT(p.id) FILTER (WHERE LOWER(p.type) LIKE '%hospital%' OR LOWER(p.type) LIKE '%clinic%') as hospital_count,
                COUNT(p.id) as total_poi_count
            FROM road_segments rs
            LEFT JOIN pois p ON ST_DWithin(rs.geometry::geography, p.geometry::geography, :radius)
            GROUP BY rs.id
        ),
        infra_data AS (
            SELECT segment_id, sidewalk, pedestrian_crossing
            FROM infrastructure_data
        ),
        traffic_mix AS (
            SELECT DISTINCT ON (segment_id) segment_id, motorcycle_mix, traffic_volume
            FROM traffic_data
            ORDER BY segment_id, date DESC
        )
        SELECT 
            pc.segment_id,
            COALESCE(pc.school_count, 0) as school_count,
            COALESCE(pc.hospital_count, 0) as hospital_count,
            COALESCE(pc.total_poi_count, 0) as total_poi_count,
            COALESCE(i.sidewalk, FALSE) as sidewalk_present,
            COALESCE(i.pedestrian_crossing, FALSE) as crossing_present,
            COALESCE(t.motorcycle_mix, 0) as two_wheeler_mix,
            COALESCE(t.traffic_volume, 0) as traffic_volume
        FROM poi_counts pc
        LEFT JOIN infra_data i ON pc.segment_id = i.segment_id
        LEFT JOIN traffic_mix t ON pc.segment_id = t.segment_id
    """)

    results = db.execute(query, {"radius": PROXIMITY_RADIUS_M}).fetchall()
    
    if not results:
        return

    data_tuples = []
    
    for row in results:
        pedestrian_estimate = (
            row.school_count * 200 +
            row.hospital_count * 150 +
            (row.total_poi_count - row.school_count - row.hospital_count) * 50
        )
        if row.traffic_volume > 0:
            pedestrian_estimate += (row.traffic_volume * 0.05)
            
        base_exposure = min(100, (pedestrian_estimate / 1000) * 50)
        
        if not row.sidewalk_present:
            base_exposure *= NO_SIDEWALK_PENALTY
        if not row.crossing_present:
            base_exposure *= NO_CROSSING_PENALTY
            
        if row.two_wheeler_mix > HIGH_2W_MIX_THRESHOLD:
            base_exposure *= 1.2
            
        final_score = min(100.0, max(0.0, base_exposure))
        
        if final_score >= 80: cat = 'Critical VRU Risk'
        elif final_score >= 60: cat = 'High VRU Risk'
        elif final_score >= 40: cat = 'Moderate VRU Risk'
        elif final_score >= 20: cat = 'Low VRU Risk'
        else: cat = 'Minimal VRU Risk'
        
        data_tuples.append((
            row.segment_id, row.school_count, row.hospital_count, row.total_poi_count,
            pedestrian_estimate, row.two_wheeler_mix, final_score, cat
        ))

    import psycopg2
    from psycopg2.extras import execute_batch
    import os
    
    DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@srsms_db:5432/srsms")
    pg_conn = psycopg2.connect(DB_DSN)
    cur = pg_conn.cursor()
    
    update_query = """
        INSERT INTO vru_exposure (
            segment_id, school_proximity_count, hospital_proximity_count, poi_proximity_count,
            pedestrian_volume_estimate, two_wheeler_mix,
            vru_exposure_score, vru_risk_category
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (segment_id) DO UPDATE SET
            school_proximity_count = EXCLUDED.school_proximity_count,
            hospital_proximity_count = EXCLUDED.hospital_proximity_count,
            poi_proximity_count = EXCLUDED.poi_proximity_count,
            pedestrian_volume_estimate = EXCLUDED.pedestrian_volume_estimate,
            two_wheeler_mix = EXCLUDED.two_wheeler_mix,
            vru_exposure_score = EXCLUDED.vru_exposure_score,
            vru_risk_category = EXCLUDED.vru_risk_category,
            calculated_at = CURRENT_TIMESTAMP
    """
    execute_batch(cur, update_query, data_tuples, page_size=5000)
    pg_conn.commit()
    cur.close()
    pg_conn.close()

    print(f"VRU Exposure Calculation Complete for {len(data_tuples)} segments!")


if __name__ == "__main__":
    from database import SessionLocal
    db = SessionLocal()
    calculate_vru_exposure(db)
    db.close()
