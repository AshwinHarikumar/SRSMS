from sqlalchemy.orm import Session
from sqlalchemy import text
from sklearn.cluster import DBSCAN
import numpy as np

def run_dbscan(db: Session):
    # Fetch accident coordinates
    # We use ST_X and ST_Y to get long and lat
    res = db.execute(text("""
        SELECT id, ST_X(geometry) as lon, ST_Y(geometry) as lat 
        FROM accidents
    """)).fetchall()

    if not res:
        return []

    coords = np.array([[row.lat, row.lon] for row in res])
    # Convert to radians for Haversine metric
    coords_rad = np.radians(coords)
    
    # eps in radians. 50 meters approx = 50 / 6371000
    eps_rad = 50.0 / 6371000.0
    
    dbscan = DBSCAN(eps=eps_rad, min_samples=3, algorithm='ball_tree', metric='haversine')
    labels = dbscan.fit_predict(coords_rad)

    clusters = {}
    for row, label in zip(res, labels):
        if label == -1: # Noise
            continue
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(row.id)
    
    return clusters
