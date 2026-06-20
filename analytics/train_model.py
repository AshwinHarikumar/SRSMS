import pandas as pd
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import joblib

DB_DSN = "postgresql://srsms_user:srsms_password@srsms_db:5432/srsms"

def train():
    print("Connecting to database to extract training data...")
    engine = create_engine(DB_DSN)
    
    # Extract features (infrastructure, speed, geometry) and target (accident_score)
    query = """
        SELECT rs.speed_limit, rs.lane_count, rs.length_meters, 
               r.traffic_score, r.infrastructure_score, r.geometry_score,
               r.accident_score
        FROM road_segments rs
        JOIN risk_scores r ON rs.id = r.segment_id
        WHERE r.accident_score IS NOT NULL
    """
    df = pd.read_sql(query, engine)
    
    # Fill NaN values
    df.fillna(0, inplace=True)
    
    if df.empty:
        print("No data available for training.")
        return

    print(f"Extracted {len(df)} records. Training Random Forest Model...")
    
    X = df[['speed_limit', 'lane_count', 'length_meters', 'traffic_score', 'infrastructure_score', 'geometry_score']]
    y = df['accident_score']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train the Random Forest
    model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    
    # Evaluate
    predictions = model.predict(X_test)
    mse = mean_squared_error(y_test, predictions)
    print(f"Model trained successfully! Mean Squared Error: {mse:.2f}")
    
    # Save the model
    joblib.dump(model, '/app/risk_model.joblib')
    print("Model saved to /app/risk_model.joblib")

if __name__ == "__main__":
    train()
