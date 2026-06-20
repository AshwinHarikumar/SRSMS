from sqlalchemy.orm import Session
from sqlalchemy import text

def generate_for_segment(db: Session, segment_id: int):
    pass # Deprecated in favor of bulk

def bulk_generate_recommendations(db: Session):
    print("Running BULK generate_recommendations...")
    scores = db.execute(text("SELECT segment_id, accident_score, speed_score, traffic_score, infrastructure_score FROM risk_scores")).fetchall()
    infra = db.execute(text("SELECT segment_id, pedestrian_crossing, lighting, traffic_signal FROM infrastructure_data")).fetchall()
    
    infra_map = {i.segment_id: i for i in infra}
    
    recs = []
    for s in scores:
        if s.speed_score > 50:
            recs.append((s.segment_id, "High Speed", "Install speed camera or implement traffic calming measures.", 0.85))
            
        i = infra_map.get(s.segment_id)
        if i:
            if not i.pedestrian_crossing and s.accident_score > 30:
                recs.append((s.segment_id, "Pedestrian Risk", "Add raised zebra crossing.", 0.90))
            if not i.lighting:
                recs.append((s.segment_id, "Lighting Deficiency", "Install LED streetlights.", 0.95))
            if not i.traffic_signal and s.traffic_score > 60:
                recs.append((s.segment_id, "Junction Risk", "Implement signalization or roundabout.", 0.80))
                
    from psycopg2.extras import execute_batch
    conn = db.connection().connection
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE recommendations RESTART IDENTITY CASCADE;")
    
    query = """
        INSERT INTO recommendations (segment_id, category, recommended_action, ai_confidence)
        VALUES (%s, %s, %s, %s)
    """
    execute_batch(cur, query, recs, page_size=5000)
    conn.commit()
    cur.close()
