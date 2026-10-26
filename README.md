# ONFIT

**크롤링 기반 개인 맞춤형 패션 코디 및 스마트 구매 추천 서비스**

ONFIT은 옷, 신발, 액세서리를 개인 취향과 체형에 맞춰 제안하고, 상품 매칭과 가격 흐름을 함께 보여주는 4인 팀 프로젝트입니다.

## Tech stack

| Area | Stack | Responsibility |
| --- | --- | --- |
| Frontend | React, Tailwind CSS, Vite | Style profile, outfit recommendations, digital wardrobe, price insights |
| API | Python, FastAPI | Member/profile, outfit, wardrobe, product and price APIs |
| Database | TiDB Cloud | Users, profiles, products, offers, price history, wardrobe and outfits |
| Collection | Python, Playwright, BeautifulSoup | Approved-source product collection and scheduled price refresh |
| Data | Pandas, NumPy, RapidFuzz | Product matching, price statistics and recommendation signals |
| Deploy | GitHub, Render | Static frontend, API web service and scheduled collection job |

## Repository layout

```text
ONFIT/
├── frontend/                 # React + Tailwind, owned by Hwang Sang-ok
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── components/        # common, outfit, wardrobe, price
│       ├── pages/
│       └── services/api.js
├── backend/                  # Single FastAPI application
│   ├── app/
│   │   ├── api/               # auth, profiles, outfits, wardrobe, products, prices
│   │   ├── core/              # settings and security
│   │   ├── crawlers/          # collectors, parsers, pipelines, scheduled jobs
│   │   ├── db/                # TiDB connection and ORM
│   │   ├── schemas/
│   │   └── services/          # styling, recommendation, price, matching
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── database/                  # schema.sql and seed.sql
├── docs/                      # project notes and existing team artifacts
├── .github/workflows/
└── render.yaml
```

## Run locally

### Frontend

```bash
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

### FastAPI

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item ..\.env.example .env
uvicorn app.main:app --reload
```

Create the target database in TiDB first, then set TiDB `TIDB_HOST`, `TIDB_PORT`, `TIDB_USERNAME`, `TIDB_PASSWORD`, and `TIDB_DATABASE` plus a strong `SECRET_KEY` in `.env` (or `backend/.env`) before starting FastAPI. The backend builds a TLS-verified TiDB URL from those fields. It creates the account table on startup and adds `password_hash` to an existing `users` table when needed. Signup is `POST /api/auth/signup`, login is `POST /api/auth/login`, and the signed-in account is `GET /api/auth/me` with a bearer token. Passwords are stored as Argon2 hashes. The example prices and product images are presentation data until the team connects approved sources and TiDB.

## Team ownership

- **Song Seong-geun (PM):** body/color styling, wardrobe and outfit recommendation APIs; integration and deliverables.
- **Hwang Sang-ok:** all frontend screens, responsive UI, profile and recommendation flows, price charts/comparison, API integration.
- **Ahn Jong-beom:** product collection, normalization and matching, seller price comparison.
- **Lee Seung-ho:** scheduled price refresh, price history, timing analysis and crawl logs.

See [ONFIT project notes](docs/onfit/README.md) for collaboration rules and data-handling notes.
