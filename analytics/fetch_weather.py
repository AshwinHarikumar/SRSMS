import requests
from sqlalchemy import text
from database import SessionLocal

def fetch_weather_and_calculate_risk(db):
    print("Fetching live weather data from Open-Meteo...")
    # Get the bounding box or center of our road segments
    res = db.execute(text("SELECT ST_Y(ST_Centroid(ST_Extent(geometry))) as lat, ST_X(ST_Centroid(ST_Extent(geometry))) as lon FROM road_segments;")).fetchone()
    if not res or res[0] is None:
        print("No road segments found to determine location.")
        return

    lat, lon = res[0], res[1]
    
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,visibility&timezone=auto"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        current = data.get("current", {})
        
        temp = current.get("temperature_2m", 25)
        precip = current.get("precipitation", 0)
        visibility = current.get("visibility", 10000) # in meters
        wind = current.get("wind_speed_10m", 0)
        code = current.get("weather_code", 0)
        
        # Calculate Weather Risk Score (0-100)
        # Heavy rain (> 10mm/h) = High risk (+40)
        # Low visibility (< 1000m) = High risk (+40)
        # High wind (> 40km/h) = High risk (+20)
        
        risk = 0
        if precip > 10: risk += 40
        elif precip > 2: risk += 20
        elif precip > 0: risk += 5
        
        if visibility < 500: risk += 40
        elif visibility < 2000: risk += 20
        elif visibility < 5000: risk += 10
        
        if wind > 60: risk += 20
        elif wind > 40: risk += 10
        
        risk = min(100, risk)
        
        print(f"Current Weather - Temp: {temp}C, Precip: {precip}mm, Vis: {visibility}m, Wind: {wind}km/h -> RISK SCORE: {risk}")
        
        # Save to DB
        db.execute(text("""
            INSERT INTO weather_data (temperature_2m, precipitation, visibility, wind_speed_10m, weather_code, overall_weather_risk_score)
            VALUES (:t, :p, :v, :w, :c, :r)
        """), {"t": temp, "p": precip, "v": visibility, "w": wind, "c": code, "r": risk})
        db.commit()
        
        # Update risk_scores with this new weather score
        db.execute(text("""
            UPDATE risk_scores SET weather_score = :r
        """), {"r": risk})
        db.commit()
        print("Updated weather risk scores for all segments.")
        
    except Exception as e:
        print(f"Error fetching weather: {e}")

if __name__ == "__main__":
    db = SessionLocal()
    fetch_weather_and_calculate_risk(db)
    db.close()
