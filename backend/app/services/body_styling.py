"""Body and color based styling rules; personalization will be added by the team."""


def styling_notes(body_shape: str | None, favorite_color: str) -> list[str]:
    notes = ["선택한 취향과 색상을 바탕으로 코디를 구성합니다."]
    if body_shape:
        notes.append("체형 입력은 직접 입력한 정보를 기준으로 반영합니다.")
    if favorite_color:
        notes.append("선호 색상과 조화로운 아이템을 우선합니다.")
    return notes
