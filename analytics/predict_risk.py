import pandas as pd
from sqlalchemy import create_engine, text
import joblib

DB_DSN = "postgresql://srsms_user:srsms_password@srsms_db:5432/srsms"

def predict():
    print("Loading AI Risk Prediction Model...")
    try:
        model = joblib.load('/app/risk_model.joblib')
    except FileNotFoundError:
        print("Model not found. Run train_model.py first.")
        return

    engine = create_engine(DB_DSN)
    
    with engine.connect() as conn:
        # Add column if it doesn't exist
        conn.execute(text("ALTER TABLE risk_scores ADD COLUMN IF NOT EXISTS predicted_risk FLOAT DEFAULT 0;"))
        conn.commit()

    print("Extracting features for all segments...")
    query = """
        SELECT rs.id, rs.speed_limit, rs.lane_count, rs.length_meters, 
               r.traffic_score, r.infrastructure_score, r.geometry_score
        FROM road_segments rs
        JOIN risk_scores r ON rs.id = r.segment_id
    """
    df = pd.read_sql(query, engine)
    df.fillna(0, inplace=True)
    
    if df.empty:
        print("No data available.")
        return

    print(f"Running predictions on {len(df)} segments...")
    X = df[['speed_limit', 'lane_count', 'length_meters', 'traffic_score', 'infrastructure_score', 'geometry_score']]
    predictions = model.predict(X)
    
    # Normalize predictions between 0 and 100 for probability
    max_pred = predictions.max() if predictions.max() > 0 else 1
    probabilities = (predictions / max_pred) * 100
    
    df['predicted_risk'] = probabilities

    print("Updating database with AI predictions...")
    
    # Bulk update using psycopg2 for speed
    import psycopg2
    from psycopg2.extras import execute_batch
    
    pg_conn = psycopg2.connect(DB_DSN)
    cur = pg_conn.cursor()
    
    update_query = "UPDATE risk_scores SET predicted_risk = %s WHERE segment_id = %s"
    data_tuples = list(zip(df['predicted_risk'].round(2), df['id']))
    
    execute_batch(cur, update_query, data_tuples, page_size=5000)
    pg_conn.commit()
    
    cur.close()
    pg_conn.close()
    print("Prediction Pipeline Complete!")

if __name__ == "__main__":
    predict()
