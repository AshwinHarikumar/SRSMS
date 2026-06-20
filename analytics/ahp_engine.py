"""
AHP (Analytic Hierarchy Process) Engine
========================================
Implements Saaty's AHP method for deriving objective weights
for the road safety risk scoring criteria.

Key features:
- Accepts an NxN pairwise comparison matrix
- Computes priority vector using the eigenvalue method
- Validates consistency with Consistency Ratio (CR < 0.10)
- Stores and manages multiple weight profiles
"""

import numpy as np
import json
from sqlalchemy.orm import Session
from sqlalchemy import text

# Saaty's Random Index values for matrix sizes 1-10
RANDOM_INDEX = {
    1: 0.00, 2: 0.00, 3: 0.58, 4: 0.90, 5: 1.12,
    6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49
}

# Default criteria labels
DEFAULT_CRITERIA = ["accident", "speed", "traffic", "infrastructure", "vru", "geometry"]

# Saaty scale descriptions
SAATY_SCALE = {
    1: "Equal importance",
    2: "Weak preference",
    3: "Moderate preference",
    4: "Moderate plus",
    5: "Strong preference",
    6: "Strong plus",
    7: "Very strong preference",
    8: "Very very strong",
    9: "Extreme preference"
}


def compute_ahp_weights(pairwise_matrix: list) -> dict:
    """
    Compute AHP weights from a pairwise comparison matrix.
    
    Args:
        pairwise_matrix: NxN list of lists with Saaty scale values.
                         Must be reciprocal (a[i][j] = 1/a[j][i]).
    
    Returns:
        dict with keys:
            - weights: dict mapping criteria to weights
            - consistency_ratio: float
            - is_consistent: bool (CR < 0.10)
            - lambda_max: float (principal eigenvalue)
            - consistency_index: float
    """
    A = np.array(pairwise_matrix, dtype=float)
    n = A.shape[0]

    if A.shape[0] != A.shape[1]:
        raise ValueError(f"Matrix must be square. Got {A.shape}")

    # Verify reciprocity (with tolerance for floating point)
    for i in range(n):
        for j in range(i + 1, n):
            expected_reciprocal = 1.0 / A[i][j] if A[i][j] != 0 else 0
            if abs(A[j][i] - expected_reciprocal) > 0.01:
                raise ValueError(
                    f"Matrix is not reciprocal at [{j}][{i}]: expected {expected_reciprocal:.3f}, got {A[j][i]}"
                )

    # Step 1: Normalize columns
    col_sums = A.sum(axis=0)
    A_normalized = A / col_sums

    # Step 2: Compute priority vector (row averages of normalized matrix)
    weights = A_normalized.mean(axis=1)

    # Step 3: Compute λ_max (principal eigenvalue)
    weighted_sum = A @ weights
    lambda_values = weighted_sum / weights
    lambda_max = lambda_values.mean()

    # Step 4: Consistency Index (CI)
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0

    # Step 5: Consistency Ratio (CR = CI / RI)
    ri = RANDOM_INDEX.get(n, 1.49)
    cr = ci / ri if ri > 0 else 0

    # Step 6: Check consistency
    is_consistent = cr < 0.10

    return {
        "weights": {DEFAULT_CRITERIA[i]: round(float(weights[i]), 4) for i in range(min(n, len(DEFAULT_CRITERIA)))},
        "consistency_ratio": round(float(cr), 4),
        "is_consistent": is_consistent,
        "lambda_max": round(float(lambda_max), 4),
        "consistency_index": round(float(ci), 4)
    }


def validate_and_create_profile(
    db: Session,
    profile_name: str,
    description: str,
    pairwise_matrix: list,
    criteria: list = None,
    created_by: int = None,
    activate: bool = False
) -> dict:
    """
    Validate an AHP matrix, compute weights, and save as a profile.
    
    Returns the computed weights and CR, or raises ValueError if inconsistent.
    """
    if criteria is None:
        criteria = DEFAULT_CRITERIA

    # Compute weights and check consistency
    result = compute_ahp_weights(pairwise_matrix)

    if not result["is_consistent"]:
        return {
            "status": "inconsistent",
            "message": f"Consistency Ratio {result['consistency_ratio']:.4f} exceeds threshold 0.10. Please revise your pairwise comparisons.",
            **result
        }

    # Build the matrix JSON
    matrix_json = {
        "matrix": pairwise_matrix,
        "criteria": criteria
    }

    # If activating this profile, deactivate all others first
    if activate:
        db.execute(text("UPDATE ahp_profiles SET is_active = FALSE WHERE is_active = TRUE"))

    # Insert the profile
    db.execute(text("""
        INSERT INTO ahp_profiles (profile_name, description, pairwise_matrix, derived_weights, consistency_ratio, is_consistent, is_active, created_by)
        VALUES (:name, :desc, :matrix, :weights, :cr, :consistent, :active, :created_by)
        ON CONFLICT (profile_name) DO UPDATE SET
            description = EXCLUDED.description,
            pairwise_matrix = EXCLUDED.pairwise_matrix,
            derived_weights = EXCLUDED.derived_weights,
            consistency_ratio = EXCLUDED.consistency_ratio,
            is_consistent = EXCLUDED.is_consistent,
            is_active = EXCLUDED.is_active,
            created_at = CURRENT_TIMESTAMP
    """), {
        "name": profile_name,
        "desc": description,
        "matrix": json.dumps(matrix_json),
        "weights": json.dumps(result["weights"]),
        "cr": result["consistency_ratio"],
        "consistent": result["is_consistent"],
        "active": activate,
        "created_by": created_by
    })
    db.commit()

    return {
        "status": "success",
        "message": f"Profile '{profile_name}' saved successfully.",
        **result
    }


def get_active_weights(db: Session) -> dict:
    """
    Retrieve the currently active AHP weight profile.
    Falls back to default weights if no active profile exists.
    """
    profile = db.execute(text("""
        SELECT derived_weights, profile_name, consistency_ratio
        FROM ahp_profiles 
        WHERE is_active = TRUE 
        LIMIT 1
    """)).fetchone()

    if profile:
        weights = json.loads(profile.derived_weights) if isinstance(profile.derived_weights, str) else profile.derived_weights
        return {
            "profile_name": profile.profile_name,
            "weights": weights,
            "consistency_ratio": profile.consistency_ratio
        }
    else:
        # Default fallback weights (original SRSMS weights extended)
        return {
            "profile_name": "Default (Hardcoded)",
            "weights": {
                "accident": 0.30,
                "speed": 0.15,
                "traffic": 0.10,
                "infrastructure": 0.10,
                "vru": 0.30,
                "geometry": 0.05
            },
            "consistency_ratio": None
        }


def list_profiles(db: Session) -> list:
    """List all AHP profiles."""
    profiles = db.execute(text("""
        SELECT id, profile_name, description, derived_weights, 
               consistency_ratio, is_consistent, is_active, created_at
        FROM ahp_profiles 
        ORDER BY created_at DESC
    """)).fetchall()

    return [
        {
            "id": p.id,
            "profile_name": p.profile_name,
            "description": p.description,
            "derived_weights": json.loads(p.derived_weights) if isinstance(p.derived_weights, str) else p.derived_weights,
            "consistency_ratio": p.consistency_ratio,
            "is_consistent": p.is_consistent,
            "is_active": p.is_active,
            "created_at": str(p.created_at)
        }
        for p in profiles
    ]


if __name__ == "__main__":
    # Example: Validate the default MoRTH Standard matrix
    matrix = [
        [1, 2, 3, 3, 1, 5],
        [0.5, 1, 2, 2, 0.5, 3],
        [1/3, 0.5, 1, 1, 1/3, 2],
        [1/3, 0.5, 1, 1, 1/3, 2],
        [1, 2, 3, 3, 1, 5],
        [0.2, 1/3, 0.5, 0.5, 0.2, 1]
    ]

    result = compute_ahp_weights(matrix)
    print("AHP Weight Computation Result:")
    print(f"  Weights: {result['weights']}")
    print(f"  λ_max: {result['lambda_max']}")
    print(f"  CI: {result['consistency_index']}")
    print(f"  CR: {result['consistency_ratio']}")
    print(f"  Consistent: {result['is_consistent']}")
