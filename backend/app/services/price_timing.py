"""Price trend and purchase timing calculations."""


def sample_price_insight(product_id: str) -> dict[str, object]:
    # Example values must never be presented as verified live marketplace prices.
    return {
        "product_id": product_id,
        "data_status": "demo",
        "current_lowest_krw": 178000,
        "sample_average_krw": 202300,
        "sample_period_low_krw": 169000,
        "recommendation": "insufficient-history",
        "message": "가격 이력이 충분하지 않아 구매 적기를 판단하지 않습니다.",
        "history": [],
    }
