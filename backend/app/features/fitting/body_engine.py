"""Pure geometry conversion from validated measurements to 3D parameters."""

from math import pi

from app.features.fitting.schemas import BodyParameters, Measurements


def calculate_body_parameters(payload: Measurements) -> BodyParameters:
    """Convert the existing measurement fields to meters without estimating values.

    Each measurement affects only its corresponding output parameter. In
    particular, abdomen protrusion and pelvis width remain independent.
    Input validation is owned by ``Measurements``; formulas and ranges are
    intentionally unchanged from the original fitting service.
    """
    return BodyParameters(
        height_m=payload.height_cm / 100,
        shoulder_width_m=payload.shoulder_width_cm / 100,
        waist_radius_m=payload.waist_circumference_cm / (200 * pi),
        chest_radius_m=payload.chest_circumference_cm / (200 * pi),
        abdomen_protrusion_m=payload.abdomen_protrusion_cm / 100,
        pelvis_width_m=payload.pelvis_width_cm / 100,
        hip_radius_m=payload.hip_circumference_cm / (200 * pi),
        thigh_radius_m=payload.thigh_circumference_cm / (200 * pi),
    )
