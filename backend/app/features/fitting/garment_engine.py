"""Rule-based garment silhouette estimates for the existing fitting preview."""

from math import pi
from typing import Literal

from app.features.fitting.schemas import BodyParameters, GarmentParameters

Fit = Literal["slim", "regular", "oversized"]

# Match the front-end's existing radial allowances (meters) so the preview
# remains visually compatible. These are illustrative design allowances.
FIT_ALLOWANCES_M: dict[str, float] = {
    "slim": 0.008,
    "regular": 0.025,
    "oversized": 0.055,
}


def calculate_garment_silhouette(
    body: BodyParameters,
    fit: Fit,
    garment_basis: BodyParameters | None = None,
) -> GarmentParameters:
    """Calculate rule-based garment dimensions and fit clearances.

    If ``garment_basis`` is supplied, its geometry remains fixed while clearances
    are measured against ``body``. This models a fixed garment size without
    resizing it when the body changes. No fabric physics or size recommendation
    is performed.
    """
    if fit not in FIT_ALLOWANCES_M:
        raise ValueError(f"지원하지 않는 핏입니다: {fit}")

    basis = garment_basis if garment_basis is not None else body
    allowance = FIT_ALLOWANCES_M[fit]

    shoulder_half_width = basis.shoulder_width_m / 2 + allowance
    chest_radius = basis.chest_radius_m + allowance
    waist_radius = basis.waist_radius_m + allowance
    abdomen_front_depth = basis.waist_radius_m + basis.abdomen_protrusion_m + allowance
    pelvis_half_width = basis.pelvis_width_m / 2 + allowance
    hip_radius = basis.hip_radius_m + allowance
    thigh_radius = basis.thigh_radius_m + allowance

    # A torso hem follows the larger of the pelvis and lower-body cross-section;
    # abdomen depth is deliberately independent from this width.
    basis_hem_half_width = max(basis.pelvis_width_m / 2, basis.hip_radius_m, basis.thigh_radius_m)
    body_hem_half_width = max(body.pelvis_width_m / 2, body.hip_radius_m, body.thigh_radius_m)
    hem_half_width = basis_hem_half_width + allowance

    return GarmentParameters(
        fit=fit,
        fixed_size=garment_basis is not None,
        shoulder_half_width_m=shoulder_half_width,
        chest_radius_m=chest_radius,
        waist_radius_m=waist_radius,
        abdomen_front_depth_m=abdomen_front_depth,
        pelvis_half_width_m=pelvis_half_width,
        hip_radius_m=hip_radius,
        thigh_radius_m=thigh_radius,
        hem_half_width_m=hem_half_width,
        chest_ease_cm=(chest_radius - body.chest_radius_m) * 200 * pi,
        waist_ease_cm=(waist_radius - body.waist_radius_m) * 200 * pi,
        abdomen_front_clearance_m=abdomen_front_depth - (body.waist_radius_m + body.abdomen_protrusion_m),
        hem_clearance_m=hem_half_width - body_hem_half_width,
    )
