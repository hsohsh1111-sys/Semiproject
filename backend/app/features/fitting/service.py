from sqlalchemy.orm import Session
from app.features.inbody.service import list_records
from app.features.styling.service import find_profile
from app.features.fitting.body_engine import calculate_body_parameters
from app.features.fitting.garment_engine import calculate_garment_silhouette
from app.features.fitting.schemas import Defaults, FittingPreviewRequest, Measurements, Preview


def defaults(db: Session, user_id: int) -> Defaults:
    records = list_records(db, user_id, limit=1, offset=0)
    if records:
        return Defaults(height_cm=records[0].height_cm, weight_kg=records[0].weight_kg, source="inbody")
    profile = find_profile(db, user_id)
    if profile:
        return Defaults(height_cm=profile.height_cm, weight_kg=profile.weight_kg, source="profile")
    return Defaults(source="none")


def preview(payload: FittingPreviewRequest) -> Preview:
    body_parameters = calculate_body_parameters(payload)
    garment_parameters = calculate_garment_silhouette(
        body=body_parameters,
        fit=payload.garment_fit,
        garment_basis=payload.fixed_garment_parameters,
    )
    measurements = Measurements.model_validate(payload.model_dump(exclude={
        "garment_fit", "fixed_garment_parameters",
    }))
    return Preview(
        measurements=measurements,
        parameters=body_parameters,
        garment_parameters=garment_parameters,
    )
