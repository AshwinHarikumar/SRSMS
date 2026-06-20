import random
from datetime import datetime, timedelta
from database import SessionLocal
from sqlalchemy import text
import uuid

def generate_synthetic_data():
    db = SessionLocal()
    
    print("Fetching segments...")
    segments = db.execute(text("""
        SELECT id, speed_limit, length_meters, ST_AsText(ST_Centroid(geometry)) as geom
        FROM road_segments
    """)).fetchall()
    
    print(f"Found {len(segments)} segments. Generating data...")
    
    # Clear existing data
    db.execute(text("TRUNCATE TABLE traffic_data CASCADE;"))
    db.execute(text("TRUNCATE TABLE speed_data CASCADE;"))
    db.execute(text("TRUNCATE TABLE accidents CASCADE;"))
    
    today = datetime.today().date()
    
    batch_size = 5000
    traffic_inserts = []
    speed_inserts = []
    accident_inserts = []
    
    for i, row in enumerate(segments):
        seg_id = row[0]
        speed_limit = row[1] or 60
        length = row[2] or 1000
        geom_wkt = row[3] # POINT(lon lat)
        
        # Traffic Data
        is_highway = speed_limit >= 80
        base_traffic = random.randint(10000, 40000) if is_highway else random.randint(1000, 15000)
        heavy_mix = random.uniform(0.1, 0.3) if is_highway else random.uniform(0.02, 0.1)
        car_mix = random.uniform(0.4, 0.6)
        moto_mix = 1.0 - (heavy_mix + car_mix)
        peak_hr = int(base_traffic * random.uniform(0.08, 0.15))
        
        traffic_inserts.append({
            "segment_id": seg_id,
            "date": today,
            "traffic_volume": base_traffic,
            "heavy_vehicle_mix": heavy_mix,
            "car_mix": car_mix,
            "motorcycle_mix": moto_mix,
            "peak_hour_volume": peak_hr
        })
        
        # Speed Data
        avg_speed = speed_limit * random.uniform(0.8, 1.1)
        p85 = avg_speed * 1.15
        max_speed = speed_limit * random.uniform(1.2, 1.5)
        violations = int(base_traffic * random.uniform(0.01, 0.05))
        
        speed_inserts.append({
            "segment_id": seg_id,
            "date": today,
            "average_speed": avg_speed,
            "percentile_85_speed": p85,
            "maximum_speed": max_speed,
            "violation_count": violations
        })
        
        # Accidents Data
        # Roughly 5% of segments get accidents, more likely on long/fast roads
        if random.random() < (0.1 if is_highway else 0.03):
            num_accidents = random.randint(1, 3)
            for _ in range(num_accidents):
                severity = random.choices(['Fatal', 'Serious', 'Minor'], weights=[0.1, 0.3, 0.6])[0]
                fatalities = random.randint(1, 3) if severity == 'Fatal' else 0
                injuries = random.randint(1, 5) if severity in ['Fatal', 'Serious'] else random.randint(0, 2)
                
                accident_inserts.append({
                    "accident_id": str(uuid.uuid4()),
                    "segment_id": seg_id,
                    "date": today - timedelta(days=random.randint(0, 365)),
                    "geometry": geom_wkt,
                    "severity": severity,
                    "fatalities": fatalities,
                    "injuries": injuries,
                    "vehicle_type": random.choice(["Car", "Motorcycle", "Truck", "Bus"]),
                    "collision_type": random.choice(["Rear-end", "Head-on", "Side-impact", "Pedestrian"])
                })
                
        # Batch insert
        if len(traffic_inserts) >= batch_size:
            print(f"Processed {i+1} segments...")
            db.execute(text("""
                INSERT INTO traffic_data (segment_id, date, traffic_volume, heavy_vehicle_mix, car_mix, motorcycle_mix, peak_hour_volume)
                VALUES (:segment_id, :date, :traffic_volume, :heavy_vehicle_mix, :car_mix, :motorcycle_mix, :peak_hour_volume)
            """), traffic_inserts)
            db.execute(text("""
                INSERT INTO speed_data (segment_id, date, average_speed, percentile_85_speed, maximum_speed, violation_count)
                VALUES (:segment_id, :date, :average_speed, :percentile_85_speed, :maximum_speed, :violation_count)
            """), speed_inserts)
            if accident_inserts:
                db.execute(text("""
                    INSERT INTO accidents (accident_id, segment_id, date, geometry, severity, fatalities, injuries, vehicle_type, collision_type)
                    VALUES (:accident_id, :segment_id, :date, ST_GeomFromText(:geometry, 4326), :severity, :fatalities, :injuries, :vehicle_type, :collision_type)
                """), accident_inserts)
            db.commit()
            traffic_inserts = []
            speed_inserts = []
            accident_inserts = []
            
    # Final batch
    if traffic_inserts:
        db.execute(text("""
            INSERT INTO traffic_data (segment_id, date, traffic_volume, heavy_vehicle_mix, car_mix, motorcycle_mix, peak_hour_volume)
            VALUES (:segment_id, :date, :traffic_volume, :heavy_vehicle_mix, :car_mix, :motorcycle_mix, :peak_hour_volume)
        """), traffic_inserts)
        db.execute(text("""
            INSERT INTO speed_data (segment_id, date, average_speed, percentile_85_speed, maximum_speed, violation_count)
            VALUES (:segment_id, :date, :average_speed, :percentile_85_speed, :maximum_speed, :violation_count)
        """), speed_inserts)
        if accident_inserts:
            db.execute(text("""
                INSERT INTO accidents (accident_id, segment_id, date, geometry, severity, fatalities, injuries, vehicle_type, collision_type)
                VALUES (:accident_id, :segment_id, :date, ST_GeomFromText(:geometry, 4326), :severity, :fatalities, :injuries, :vehicle_type, :collision_type)
            """), accident_inserts)
        db.commit()

    print("Data Generation Complete!")
    db.close()

if __name__ == "__main__":
    generate_synthetic_data()
