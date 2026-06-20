import time
from database import SessionLocal
from risk_engine import bulk_calculate_and_save_scores, calculate_all_priority_indices
from recommendation import bulk_generate_recommendations
from sqlalchemy import text

def process_all():
    db = SessionLocal()

    print("--- Starting AI Analytics Pipeline ---")
    start_time = time.time()

    # Step 1: Risk Scores & Recommendations
    print("\n[Phase 1] Calculating Base Risk Scores & AI Recommendations...")
    bulk_calculate_and_save_scores(db)
    bulk_generate_recommendations(db)

    # Step 1.5: Environmental Data (Weather & Elevation)
    print("\n--- Phase 1.5: Fetching Environmental Data ---")
    try:
        from fetch_elevation import fetch_elevation_and_calculate_gradient
        from fetch_weather import fetch_weather_and_calculate_risk
        # fetch_elevation_and_calculate_gradient(db)
        # fetch_weather_and_calculate_risk(db)
        print("Skipping Open-Meteo fetches due to rate limit timeouts.")
    except Exception as e:
        print(f"Error fetching environmental data: {e}")

    # Step 2: Calculate VRU Exposure Index
    print("\n[Phase 2] Calculating Vulnerable Road User (VRU) Exposure via PostGIS...")
    try:
        from vru_exposure import calculate_vru_exposure
        calculate_vru_exposure(db)
    except Exception as e:
        print(f"Error calculating VRU exposure: {e}")

    # Step 3: Calculate Priority Indices (now uses AHP weights + VRU)
    print("\n--- Phase 3: AHP-Weighted Priority Indices ---")
    try:
        calculate_all_priority_indices(db)
    except Exception as e:
        print(f"Error calculating PI: {e}")

    # Step 4: Detect MoRTH Black Spots
    print("\n--- Phase 4: MoRTH Black Spot Detection ---")
    try:
        from black_spot_detector import detect_black_spots
        detect_black_spots(db)
    except Exception as e:
        print(f"Error detecting black spots: {e}")

    # Step 5: Train Black Spot ML Model & Predict
    print("\n--- Phase 5: Black Spot ML Prediction ---")
    try:
        from black_spot_detector import train_blackspot_model
        train_blackspot_model()
    except Exception as e:
        print(f"Error training black spot model: {e}")

    # Step 6: Calculate Star Ratings
    print("\n--- Phase 6: iRAP Star Rating ---")
    try:
        from star_rating import calculate_star_ratings
        calculate_star_ratings(db)
    except Exception as e:
        import traceback
        traceback.print_exc()
        
    print("\n========================================")
    print("All Analytics Processing Complete!")
    print("========================================")
    db.close()

if __name__ == "__main__":
    process_all()
