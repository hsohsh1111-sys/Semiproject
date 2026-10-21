from app.schemas.profile import StyleProfileInput
from app.services.body_styling import styling_notes

SAMPLE_OUTFITS = [
    {"id": "look-01", "title": "소프트 시티 룩", "label": "CITY · EASY", "match": 96, "description": "뉴트럴 컬러에 가벼운 포인트를 더한 코디.", "image": "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1050&q=85"},
    {"id": "look-02", "title": "모던 데일리", "label": "MODERN · DAILY", "match": 92, "description": "매일 입는 아이템을 새로운 비율로 조합했어요.", "image": "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1050&q=85"},
]


def recommend_outfits(profile: StyleProfileInput | None) -> list[dict[str, object]]:
    if profile:
        notes = styling_notes(profile.body_shape, profile.favorite_color)
        return [{**look, "profile_style": profile.style, "styling_notes": notes} for look in SAMPLE_OUTFITS]
    return SAMPLE_OUTFITS
