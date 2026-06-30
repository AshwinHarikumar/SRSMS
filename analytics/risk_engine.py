from sqlalchemy.orm import Session
from sqlalchemy import text

def calculate_and_save_scores(db: Session, segment_id: int):
    pass # Deprecated in favor of bulk processing

def bulk_calculate_and_save_scores(db: Session):
    print("Running BULK calculate_and_save_scores...")
    # 1. Accident Scores
    accident_scores = db.execute(text("""
        SELECT segment_id, 
            SUM(CASE severity WHEN 'Fatal' THEN 10 WHEN 'Serious' THEN 7 WHEN 'Minor' THEN 3 ELSE 1 END) as raw_score
        FROM accidents GROUP BY segment_id
    """)).fetchall()
    
    score_map = {row.segment_id: {"acc": min(100, row.raw_score)} for row in accident_scores}
    
    # 2. Base roads
    roads = db.execute(text("SELECT id, speed_limit FROM road_segments")).fetchall()
    for r in roads:
        if r.id not in score_map: score_map[r.id] = {"acc": 0}
        score_map[r.id]["limit"] = r.speed_limit
        
    # 3. Speed Data
    speeds = db.execute(text("SELECT segment_id, MAX(average_speed) as avg_speed FROM speed_data GROUP BY segment_id")).fetchall()
    for s in speeds:
        if s.segment_id in score_map and score_map[s.segment_id].get("limit"):
            ratio = s.avg_speed / score_map[s.segment_id]["limit"]
            score_map[s.segment_id]["spd"] = min(100, (ratio - 1.0) * 500) if ratio > 1.0 else 0
            
    # 4. Traffic Data
    traffic = db.execute(text("SELECT segment_id, MAX(traffic_volume * ((heavy_vehicle_mix * 1.5) + (car_mix * 1.0) + (motorcycle_mix * 0.8))) as raw_t FROM traffic_data GROUP BY segment_id")).fetchall()
    for t in traffic:
        if t.segment_id in score_map: score_map[t.segment_id]["trf"] = min(100, t.raw_t / 1000)
        
    # 5. Infrastructure Data
    infra = db.execute(text("SELECT segment_id, pedestrian_crossing, sidewalk, lighting, signage, traffic_signal FROM infrastructure_data")).fetchall()
    for i in infra:
        if i.segment_id in score_map:
            defs = 0
            if not i.pedestrian_crossing: defs += 1
            if not i.sidewalk: defs += 1
            if not i.lighting: defs += 1
            if not i.signage: defs += 1
            if not i.traffic_signal: defs += 1
            score_map[i.segment_id]["inf"] = (defs / 5.0) * 100

    # Bulk Insert
    data_tuples = []
    for sid, data in score_map.items():
        data_tuples.append((
            sid, 
            data.get("acc", 0), 
            data.get("spd", 0), 
            data.get("trf", 0), 
            data.get("inf", 0)
        ))
        
    from psycopg2.extras import execute_batch
    conn = db.connection().connection
    cur = conn.cursor()
    
    query = """
        INSERT INTO risk_scores (segment_id, accident_score, speed_score, traffic_score, infrastructure_score)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (segment_id) DO UPDATE SET 
            accident_score = EXCLUDED.accident_score,
            speed_score = EXCLUDED.speed_score,
            traffic_score = EXCLUDED.traffic_score,
            infrastructure_score = EXCLUDED.infrastructure_score,
            calculated_at = CURRENT_TIMESTAMP
    """
    execute_batch(cur, query, data_tuples, page_size=5000)
    conn.commit()
    cur.close()


def calculate_all_priority_indices(db: Session):
    """
    Calculate Composite Priority Index using AHP-derived weights.
    Falls back to default weights if no active AHP profile exists.
    """
    from ahp_engine import get_active_weights
    import json

    # Get AHP weights
    ahp = get_active_weights(db)
    w = ahp["weights"]
    print(f"Using AHP profile: {ahp['profile_name']}")
    print(f"  Weights: {w}")

    w_acc = w.get("accident", 0.30)
    w_spd = w.get("speed", 0.15)
    w_trf = w.get("traffic", 0.10)
    w_inf = w.get("infrastructure", 0.10)
    w_vru = w.get("vru", 0.30)
    w_geo = w.get("geometry", 0.05)
    w_wth = w.get("weather", 0.05) # New AHP parameter for weather

    scores = db.execute(text("""
        SELECT 
            r.segment_id, 
            r.accident_score, r.speed_score, r.traffic_score, 
            r.infrastructure_score, COALESCE(r.geometry_score, 0) as geometry_score,
            COALESCE(r.weather_score, 0) as weather_score,
            COALESCE(v.vru_exposure_score, 0) as vru_score
        FROM risk_scores r
        LEFT JOIN vru_exposure v ON r.segment_id = v.segment_id
    """)).fetchall()
    
    data_tuples = []
    for score in scores:
        pi = (
            w_acc * score.accident_score +
            w_spd * score.speed_score +
            w_trf * score.traffic_score +
            w_inf * score.infrastructure_score +
            w_vru * score.vru_score +
            w_geo * score.geometry_score +
            w_wth * score.weather_score
        )
        
        category = "Low Risk"
        color = "Green"
        if 26 <= pi <= 50:
            category, color = "Moderate Risk", "Yellow"
        elif 51 <= pi <= 75:
            category, color = "High Risk", "Orange"
        elif 76 <= pi <= 100:
            category, color = "Critical Risk", "Red"

        data_tuples.append((
            score.segment_id, float(pi), category, color
        ))

    import psycopg2
    from psycopg2.extras import execute_batch
    import os
    
    DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@db:5432/srsms")
    pg_conn = psycopg2.connect(DB_DSN)
    cur = pg_conn.cursor()
    
    update_query = """
        INSERT INTO priority_indices (segment_id, composite_pi, priority_category, color_code)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (segment_id) DO UPDATE SET 
            composite_pi = EXCLUDED.composite_pi,
            priority_category = EXCLUDED.priority_category,
            color_code = EXCLUDED.color_code,
            calculated_at = CURRENT_TIMESTAMP
    """
    execute_batch(cur, update_query, data_tuples, page_size=5000)
    pg_conn.commit()
    cur.close()
    pg_conn.close()

