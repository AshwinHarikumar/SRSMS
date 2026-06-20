from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, engine, Base
from pydantic import BaseModel
from typing import List, Optional
import risk_engine
import clustering
import recommendation

app = FastAPI(title="SRSMS Analytics Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Analytics Engine is running"}

@app.post("/api/calculate-risk/{segment_id}")
def calculate_risk(segment_id: int, db: Session = Depends(get_db)):
    try:
        risk_engine.calculate_and_save_scores(db, segment_id)
        return {"status": "success", "segment_id": segment_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/calculate-priority")
def calculate_priority(db: Session = Depends(get_db)):
    try:
        risk_engine.calculate_all_priority_indices(db)
        return {"status": "success", "message": "Priority indices calculated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect-blackspots")
def detect_blackspots(db: Session = Depends(get_db)):
    try:
        clusters = clustering.run_dbscan(db)
        return {"status": "success", "clusters": clusters}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-recommendations/{segment_id}")
def generate_recommendations(segment_id: int, db: Session = Depends(get_db)):
    try:
        recs = recommendation.generate_for_segment(db, segment_id)
        return {"status": "success", "recommendations": recs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────
# NEW ENDPOINTS: MoRTH Black Spot Detection
# ──────────────────────────────────────────

@app.post("/api/detect-blackspots-morth")
def detect_blackspots_morth(db: Session = Depends(get_db)):
    """Run MoRTH-compliant black spot detection on all segments."""
    try:
        from black_spot_detector import detect_black_spots
        detect_black_spots(db)
        return {"status": "success", "message": "MoRTH black spot detection complete"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/train-blackspot-model")
def train_blackspot_model():
    """Train the Gradient Boosted Trees black spot prediction model."""
    try:
        from black_spot_detector import train_blackspot_model
        train_blackspot_model()
        return {"status": "success", "message": "Black spot ML model trained"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────
# NEW ENDPOINTS: VRU Exposure Index
# ──────────────────────────────────────────

@app.post("/api/calculate-vru-exposure")
def calculate_vru_exposure(db: Session = Depends(get_db)):
    """Calculate VRU Exposure Index for all segments."""
    try:
        from vru_exposure import calculate_vru_exposure as calc_vru
        calc_vru(db)
        return {"status": "success", "message": "VRU exposure calculated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────
# NEW ENDPOINTS: Star Rating
# ──────────────────────────────────────────

@app.post("/api/calculate-star-ratings")
def calculate_star_ratings(db: Session = Depends(get_db)):
    """Calculate iRAP-style star ratings for all segments."""
    try:
        from star_rating import calculate_star_ratings as calc_stars
        calc_stars(db)
        return {"status": "success", "message": "Star ratings calculated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────
# NEW ENDPOINTS: AHP Weight Management
# ──────────────────────────────────────────

class AHPProfileRequest(BaseModel):
    profile_name: str
    description: str = ""
    pairwise_matrix: List[List[float]]
    criteria: Optional[List[str]] = None
    activate: bool = False

@app.post("/api/ahp/validate")
def validate_ahp_matrix(request: AHPProfileRequest):
    """Validate an AHP pairwise comparison matrix and return weights + CR."""
    try:
        from ahp_engine import compute_ahp_weights
        result = compute_ahp_weights(request.pairwise_matrix)
        return {"status": "success", **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ahp/profiles")
def create_ahp_profile(request: AHPProfileRequest, db: Session = Depends(get_db)):
    """Create or update an AHP weight profile."""
    try:
        from ahp_engine import validate_and_create_profile
        result = validate_and_create_profile(
            db=db,
            profile_name=request.profile_name,
            description=request.description,
            pairwise_matrix=request.pairwise_matrix,
            criteria=request.criteria,
            activate=request.activate
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ahp/profiles")
def list_ahp_profiles(db: Session = Depends(get_db)):
    """List all AHP weight profiles."""
    try:
        from ahp_engine import list_profiles
        profiles = list_profiles(db)
        return {"profiles": profiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ahp/active")
def get_active_ahp(db: Session = Depends(get_db)):
    """Get the currently active AHP weight profile."""
    try:
        from ahp_engine import get_active_weights
        result = get_active_weights(db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
