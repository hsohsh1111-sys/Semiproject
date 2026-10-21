from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
def auth_status() -> dict[str, str]:
    return {"status": "prototype", "message": "회원 인증 API 연결 전입니다."}
