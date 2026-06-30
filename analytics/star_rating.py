"""
iRAP-Inspired Star Rating Engine
==================================
Computes a 1-5 star safety rating for each road segment based on:
1. Infrastructure quality (sidewalk, lighting, guardrail, crossing, signal)
2. Speed management (operating speed vs. safe design speed)
3. Crash history (normalized accident severity score)
4. VRU protection (inverse of VRU exposure)

Star ratings follow the iRAP methodology principle:
  1★ = Most dangerous (SRS < 20)
  2★ = Poor (SRS 20-39)
  3★ = Average (SRS 40-59)
  4★ = Good (SRS 60-79)
  5★ = Safest (SRS >= 80)
"""

from sqlalchemy.orm import Session
from sqlalchemy import text
import json

# Star rating thresholds (Safety Rating Score)
STAR_THRESHOLDS = [
    (80, 5, '5-Star (Safe)'),
    (60, 4, '4-Star (Good)'),
    (40, 3, '3-Star (Average)'),
    (20, 2, '2-Star (Poor)'),
    (0,  1, '1-Star (Critical)')
]

# Safe operating speeds by road class (km/h)
SAFE_SPEEDS = {
    'motorway': 80, 'trunk': 70, 'primary': 60,
    'secondary': 50, 'tertiary': 40, 'residential': 30,
    'unclassified': 30, 'living_street': 20, 'highway': 70,
    'arterial': 50, 'local': 30
}


def calculate_star_ratings(db: Session):
    """
    Calculate iRAP-inspired star ratings for all road segments.
    Uses AHP-derived weights if available.
    """
    print("Calculating iRAP-Style Star Ratings...")

    # Get AHP weights (uses active profile or defaults)
    from ahp_engine import get_active_weights
    ahp = get_active_weights(db)
    weights = ahp["weights"]
    print(f"Using AHP profile: {ahp['profile_name']}")

    # Define sub-score weights for star rating
    # These use the AHP-derived weights, normalized to 4 criteria
    w_infra = float(weights.get("infrastructure", 0.10))
    w_speed = float(weights.get("speed", 0.15))
    w_crash = float(weights.get("accident", 0.30))
    w_vru = float(weights.get("vru", 0.30))

    # Normalize so they sum to 1
    total = w_infra + w_speed + w_crash + w_vru
    w_infra /= total
    w_speed /= total
    w_crash /= total
    w_vru /= total

    # Get all segments with their data
    segments = db.execute(text("""
        SELECT 
            rs.id as segment_id,
            rs.speed_limit,
            LOWER(COALESCE(r.road_class, 'unclassified')) as road_class,
            COALESCE(id_data.pedestrian_crossing, FALSE) as ped_crossing,
            COALESCE(id_data.sidewalk, FALSE) as sidewalk,
            COALESCE(id_data.lighting, FALSE) as lighting,
            COALESCE(id_data.signage, FALSE) as signage,
            COALESCE(id_data.guardrail, FALSE) as guardrail,
            COALESCE(id_data.traffic_signal, FALSE) as traffic_signal,
            COALESCE(sd.average_speed, rs.speed_limit) as avg_speed,
            COALESCE(rs_scores.accident_score, 0) as accident_score,
            COALESCE(vru.vru_exposure_score, 0) as vru_exposure_score
        FROM road_segments rs
        LEFT JOIN roads r ON rs.road_id = r.id
        LEFT JOIN infrastructure_data id_data ON rs.id = id_data.segment_id
        LEFT JOIN (
            SELECT DISTINCT ON (segment_id) segment_id, average_speed 
            FROM speed_data ORDER BY segment_id, date DESC
        ) sd ON rs.id = sd.segment_id
        LEFT JOIN risk_scores rs_scores ON rs.id = rs_scores.segment_id
        LEFT JOIN vru_exposure vru ON rs.id = vru.segment_id
    """)).fetchall()

    print(f"Rating {len(segments)} segments...")

    data_tuples = []
    for seg in segments:
        # 1. Infrastructure Sub-Score (0-100, higher = safer)
        infra_items = [
            seg.ped_crossing, seg.sidewalk, seg.lighting,
            seg.signage, seg.guardrail, seg.traffic_signal
        ]
        infra_present = sum(1 for x in infra_items if x)
        infrastructure_sub = (infra_present / 6.0) * 100

        # 2. Speed Management Sub-Score (0-100, higher = safer)
        safe_speed = SAFE_SPEEDS.get(seg.road_class, 40)
        speed_limit = seg.speed_limit or 40
        avg_speed = seg.avg_speed or speed_limit

        # Score based on how close operating speed is to safe speed
        if avg_speed <= safe_speed:
            speed_management_sub = 100.0
        else:
            speed_ratio = avg_speed / safe_speed
            speed_management_sub = max(0, 100 - (speed_ratio - 1.0) * 200)

        # 3. Crash History Sub-Score (0-100, higher = safer, inverse of accident score)
        crash_history_sub = max(0, 100 - seg.accident_score)

        # 4. VRU Protection Sub-Score (0-100, higher = safer, inverse of exposure)
        vru_protection_sub = max(0, 100 - seg.vru_exposure_score)

        # Compute weighted Safety Rating Score (SRS)
        srs_score = (
            w_infra * infrastructure_sub +
            w_speed * speed_management_sub +
            w_crash * crash_history_sub +
            w_vru * vru_protection_sub
        )
        srs_score = round(srs_score, 1)

        # Map to star rating
        star_rating = 1
        star_category = '1-Star (Critical)'
        for threshold, stars, category in STAR_THRESHOLDS:
            if srs_score >= threshold:
                star_rating = stars
                star_category = category
                break

        data_tuples.append((
            seg.segment_id, star_rating, star_category,
            round(infrastructure_sub, 1), round(speed_management_sub, 1),
            round(crash_history_sub, 1), round(vru_protection_sub, 1), srs_score
        ))

    import psycopg2
    from psycopg2.extras import execute_batch
    import os
    
    DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@db:5432/srsms")
    pg_conn = psycopg2.connect(DB_DSN)
    cur = pg_conn.cursor()
    
    update_query = """
        INSERT INTO star_ratings (
            segment_id, star_rating, star_category,
            infrastructure_sub, speed_management_sub,
            crash_history_sub, vru_protection_sub, srs_score
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (segment_id) DO UPDATE SET
            star_rating = EXCLUDED.star_rating,
            star_category = EXCLUDED.star_category,
            infrastructure_sub = EXCLUDED.infrastructure_sub,
            speed_management_sub = EXCLUDED.speed_management_sub,
            crash_history_sub = EXCLUDED.crash_history_sub,
            vru_protection_sub = EXCLUDED.vru_protection_sub,
            srs_score = EXCLUDED.srs_score,
            calculated_at = CURRENT_TIMESTAMP
    """
    execute_batch(cur, update_query, data_tuples, page_size=5000)
    pg_conn.commit()
    cur.close()
    pg_conn.close()

    # Summary
    stats = db.execute(text("""
        SELECT star_rating, star_category, COUNT(*) as count
        FROM star_ratings
        GROUP BY star_rating, star_category
        ORDER BY star_rating
    """)).fetchall()

    print("Star Rating Calculation Complete!")
    for row in stats:
        num_stars = int(row.star_rating)
        stars = '★' * num_stars + '☆' * (5 - num_stars)
        print(f"  {stars} {row.star_category}: {row.count} segments")


if __name__ == "__main__":
    from database import SessionLocal
    db = SessionLocal()
    calculate_star_ratings(db)
    db.close()
