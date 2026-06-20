import requests
from sqlalchemy import text
from database import SessionLocal
import math

def fetch_elevation_and_calculate_gradient(db):
    print("Fetching elevation data from Open-Meteo...")
    
    # We will fetch start and end points for all segments
    # To avoid rate limits, we'll batch the requests if necessary, but open-meteo supports many points
    segments = db.execute(text("""
        SELECT 
            id, 
            ST_Y(ST_StartPoint(geometry)) as start_lat, 
            ST_X(ST_StartPoint(geometry)) as start_lon,
            ST_Y(ST_EndPoint(geometry)) as end_lat, 
            ST_X(ST_EndPoint(geometry)) as end_lon,
            ST_Length(geometry::geography) as length_m
        FROM road_segments
    """)).fetchall()
    
    if not segments:
        return
        
    print(f"Calculating elevation for {len(segments)} segments...")
    
    # Open-Meteo accepts max 100 coordinates per request, so batch them
    batch_size = 40
    
    for i in range(0, len(segments), batch_size):
        batch = segments[i:i+batch_size]
        lats = []
        lons = []
        for s in batch:
            lats.extend([s.start_lat, s.end_lat])
            lons.extend([s.start_lon, s.end_lon])
            
        lat_str = ",".join(map(str, lats))
        lon_str = ",".join(map(str, lons))
        
        try:
            url = f"https://api.open-meteo.com/v1/elevation?latitude={lat_str}&longitude={lon_str}"
            response = requests.get(url, timeout=10)
            data = response.json()
            elevations = data.get("elevation", [])
            
            if len(elevations) == len(lats):
                # Update database
                for j, s in enumerate(batch):
                    start_elev = elevations[j*2]
                    end_elev = elevations[j*2 + 1]
                    
                    # Gradient (%) = (Rise / Run) * 100
                    rise = abs(end_elev - start_elev)
                    run = s.length_m if s.length_m > 0 else 1
                    gradient = (rise / run) * 100
                    
                    db.execute(text("""
                        UPDATE road_segments 
                        SET elevation_start = :estart, elevation_end = :eend, gradient = :grad
                        WHERE id = :id
                    """), {"estart": start_elev, "eend": end_elev, "grad": gradient, "id": s.id})
                db.commit()
            else:
                print("Mismatch in elevation data returned")
        except Exception as e:
            print(f"Error fetching elevation: {e}")
            
    print("Elevation and gradients updated successfully!")
    
    # Update geometry_score based on gradient
    # A gradient > 5% is risky. > 10% is very risky.
    db.execute(text("""
        UPDATE risk_scores 
        SET geometry_score = LEAST(100, COALESCE((SELECT gradient * 10 FROM road_segments WHERE id = risk_scores.segment_id), 0))
    """))
    db.commit()
    print("Geometry risk scores updated based on actual topography.")

if __name__ == "__main__":
    db = SessionLocal()
    fetch_elevation_and_calculate_gradient(db)
    db.close()
