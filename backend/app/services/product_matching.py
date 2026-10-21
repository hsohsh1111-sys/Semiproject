"""Normalize marketplace listings and match identical product variants."""

SAMPLES = [
    {"id": "p1", "name": "Sculpted Knit Top", "category": "TOP · OATMEAL", "price": 89000, "image": "https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=900&q=85", "tag": "YOUR COLOR"},
    {"id": "p2", "name": "Everyday Leather Tote", "category": "BAG · ESPRESSO", "price": 178000, "image": "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85", "tag": "BEST MATCH"},
    {"id": "p3", "name": "Soft Form Sneakers", "category": "SHOES · CLOUD", "price": 129000, "image": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85", "tag": "TRENDING"},
]


def sample_products() -> list[dict[str, object]]:
    return SAMPLES
