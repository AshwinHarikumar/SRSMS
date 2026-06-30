"""
MoRTH Black Spot Detector
==========================
Identifies hazardous road locations using:
1. Rule-based MoRTH criteria (>=5 accidents OR >=10 fatalities in 500m over 3 years)
2. ML-based crash prediction using Gradient Boosted Trees
"""

import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
import joblib
import os

DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@db:5432/srsms")

# MoRTH Criteria Thresholds
ACCIDENT_THRESHOLD = 5      # 5+ accidents in 3 years
FATALITY_THRESHOLD = 10     # 10+ fatalities in 3 years
BUFFER_RADIUS_M = 500       # 500 meter radius
ANALYSIS_YEARS = 3          # Look-back period


def detect_black_spots(db: Session):
    """
    Rule-based black spot detection using MoRTH criteria (BULK MODE).
    """
    print("Running MoRTH Black Spot Detection (BULK MODE)...")

    query = text("""
        WITH segment_accidents AS (
            SELECT 
                rs.id as segment_id,
                COUNT(a.id) as accident_count,
                COALESCE(SUM(a.fatalities), 0) as fatality_count,
                COALESCE(SUM(CASE WHEN a.severity = 'Serious' THEN 1 ELSE 0 END), 0) as serious_count
            FROM road_segments rs
            LEFT JOIN accidents a ON ST_DWithin(
                a.geometry::geography,
                ST_Centroid(rs.geometry)::geography,
                :buffer_m
            ) AND a.date >= CURRENT_DATE - INTERVAL '3 years'
            GROUP BY rs.id
        )
        SELECT 
            segment_id,
            accident_count,
            fatality_count,
            serious_count
        FROM segment_accidents
    """)

    results = db.execute(query, {"buffer_m": BUFFER_RADIUS_M}).fetchall()
    
    if not results:
        return

    data_tuples = []
    for row in results:
        is_bs = (row.accident_count >= ACCIDENT_THRESHOLD) or (row.fatality_count >= FATALITY_THRESHOLD)
        data_tuples.append((
            row.segment_id, BUFFER_RADIUS_M, row.accident_count,
            row.fatality_count, row.serious_count, is_bs
        ))

    import psycopg2
    from psycopg2.extras import execute_batch
    import os
    
    DB_DSN = os.getenv("DATABASE_URL", "postgresql://srsms_user:srsms_password@db:5432/srsms")
    pg_conn = psycopg2.connect(DB_DSN)
    cur = pg_conn.cursor()

    # Create the cluster_centroid dynamically using ST_Centroid on insert
    update_query = """
        INSERT INTO black_spots (
            segment_id, cluster_centroid, buffer_radius_m,
            accident_count, fatality_count, serious_injury_count,
            is_black_spot, analysis_period_start, analysis_period_end
        )
        VALUES (
            %s, 
            (SELECT ST_Centroid(geometry) FROM road_segments WHERE id = %s),
            %s, %s, %s, %s, %s,
            CURRENT_DATE - INTERVAL '3 years',
            CURRENT_DATE
        )
        ON CONFLICT (segment_id) DO UPDATE SET
            accident_count = EXCLUDED.accident_count,
            fatality_count = EXCLUDED.fatality_count,
            serious_injury_count = EXCLUDED.serious_injury_count,
            is_black_spot = EXCLUDED.is_black_spot,
            analysis_period_start = EXCLUDED.analysis_period_start,
            analysis_period_end = EXCLUDED.analysis_period_end,
            calculated_at = CURRENT_TIMESTAMP
    """
    
    # We must format the data_tuples properly for the insert because segment_id is used twice
    insert_tuples = []
    for dt in data_tuples:
        insert_tuples.append((dt[0], dt[0], dt[1], dt[2], dt[3], dt[4], dt[5]))
        
    execute_batch(cur, update_query, insert_tuples, page_size=5000)
    pg_conn.commit()
    cur.close()
    pg_conn.close()

    bs_count = sum(1 for x in insert_tuples if x[6])
    print(f"Black Spot Detection Complete! Found {bs_count} MoRTH-classified black spots.")


def train_blackspot_model():
    """
    Train a Gradient Boosted Trees classifier to predict black spots.
    Uses infrastructure, speed, traffic, geometry features to predict
    whether a segment meets MoRTH black spot criteria.
    """
    print("Training Black Spot Prediction Model (Gradient Boosted Trees)...")
    engine = create_engine(DB_DSN)

    query = """
        SELECT 
            rs.speed_limit, rs.lane_count, rs.length_meters,
            rs.curvature, rs.gradient, rs.shoulder_width,
            COALESCE(r.traffic_score, 0) as traffic_score,
            COALESCE(r.infrastructure_score, 0) as infrastructure_score,
            COALESCE(r.geometry_score, 0) as geometry_score,
            COALESCE(r.speed_score, 0) as speed_score,
            COALESCE(v.vru_exposure_score, 0) as vru_exposure_score,
            COALESCE(v.two_wheeler_mix, 0) as two_wheeler_mix,
            CASE WHEN bs.is_black_spot THEN 1 ELSE 0 END as is_black_spot
        FROM road_segments rs
        LEFT JOIN risk_scores r ON rs.id = r.segment_id
        LEFT JOIN vru_exposure v ON rs.id = v.segment_id
        LEFT JOIN black_spots bs ON rs.id = bs.segment_id
        WHERE bs.segment_id IS NOT NULL
    """

    df = pd.read_sql(query, engine)
    df.fillna(0, inplace=True)

    if df.empty or len(df) < 10:
        print("Insufficient data for training. Need at least 10 segments with black spot analysis.")
        return

    feature_cols = [
        'speed_limit', 'lane_count', 'length_meters',
        'curvature', 'gradient', 'shoulder_width',
        'traffic_score', 'infrastructure_score', 'geometry_score',
        'speed_score', 'vru_exposure_score', 'two_wheeler_mix'
    ]

    X = df[feature_cols]
    y = df['is_black_spot']

    print(f"Dataset: {len(df)} samples, {y.sum()} black spots, {len(df) - y.sum()} safe segments")

    # Handle class imbalance with scale_pos_weight
    n_neg = (y == 0).sum()
    n_pos = max((y == 1).sum(), 1)
    scale_ratio = n_neg / n_pos

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if n_pos >= 2 else None
    )

    model = GradientBoostingClassifier(
        n_estimators=150,
        max_depth=5,
        learning_rate=0.1,
        min_samples_split=5,
        min_samples_leaf=3,
        random_state=42
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    print("\n--- Model Evaluation ---")
    print(classification_report(y_test, y_pred, target_names=['Safe', 'Black Spot'], zero_division=0))
    if len(set(y_test)) > 1:
        print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.3f}")

    # Feature importance
    importances = dict(zip(feature_cols, model.feature_importances_))
    print("\nFeature Importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        print(f"  {feat}: {imp:.4f}")

    # Save model
    model_path = '/app/blackspot_model.joblib'
    joblib.dump(model, model_path)
    print(f"\nModel saved to {model_path}")

    # Run predictions on all segments and update DB
    _predict_blackspots(engine, model, feature_cols)


def _predict_blackspots(engine, model, feature_cols):
    """Apply trained model to predict black spot probability for all segments."""
    print("Running ML predictions on all segments...")

    query = """
        SELECT 
            rs.id,
            rs.speed_limit, rs.lane_count, rs.length_meters,
            rs.curvature, rs.gradient, rs.shoulder_width,
            COALESCE(r.traffic_score, 0) as traffic_score,
            COALESCE(r.infrastructure_score, 0) as infrastructure_score,
            COALESCE(r.geometry_score, 0) as geometry_score,
            COALESCE(r.speed_score, 0) as speed_score,
            COALESCE(v.vru_exposure_score, 0) as vru_exposure_score,
            COALESCE(v.two_wheeler_mix, 0) as two_wheeler_mix
        FROM road_segments rs
        LEFT JOIN risk_scores r ON rs.id = r.segment_id
        LEFT JOIN vru_exposure v ON rs.id = v.segment_id
    """

    df = pd.read_sql(query, engine)
    df.fillna(0, inplace=True)

    if df.empty:
        print("No segments to predict.")
        return

    X = df[feature_cols]
    probabilities = model.predict_proba(X)[:, 1]
    predictions = model.predict(X)

    df['ml_predicted_probability'] = probabilities
    df['ml_predicted_class'] = ['black_spot' if p == 1 else 'safe' for p in predictions]

    # Bulk update
    import psycopg2
    from psycopg2.extras import execute_batch

    pg_conn = psycopg2.connect(DB_DSN)
    cur = pg_conn.cursor()

    update_query = """
        UPDATE black_spots 
        SET ml_predicted_probability = %s, ml_predicted_class = %s 
        WHERE segment_id = %s
    """
    data_tuples = list(zip(
        df['ml_predicted_probability'].round(4),
        df['ml_predicted_class'],
        df['id']
    ))

    execute_batch(cur, update_query, data_tuples, page_size=5000)
    pg_conn.commit()
    cur.close()
    pg_conn.close()

    ml_bs = (predictions == 1).sum()
    print(f"ML Prediction Complete! {ml_bs} segments predicted as black spots.")


if __name__ == "__main__":
    from database import SessionLocal
    db = SessionLocal()
    detect_black_spots(db)
    train_blackspot_model()
    db.close()
