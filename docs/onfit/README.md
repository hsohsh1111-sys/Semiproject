# ONFIT project notes

ONFIT is a four-person team project: personal styling and smart shopping recommendations for fashion, shoes, and accessories.

## Team ownership

- **Song Seong-geun:** PM, body/color styling, wardrobe and outfit recommendation APIs.
- **Hwang Sang-ok:** all React/Tailwind UI, profile input, outfit and closet screens, price chart/comparison screens, responsive behavior, API integration.
- **Ahn Jong-beom:** permitted-source product collection, product normalization/matching, marketplace comparison.
- **Lee Seung-ho:** scheduled price refresh, price history, trend analysis, collection logs.

## API and data rules

- FastAPI is the single API service. The collection worker is a separate process.
- TiDB Cloud is MySQL compatible and stores profiles, products, offers, price history, wardrobe, outfits, and collection logs.
- Keep demo prices labeled as demo data. Do not claim a buy-timing recommendation when the price history is too short.
- Agree on request/response schemas and PR/branch rules before parallel feature work.
- Check each marketplace's terms and allowed collection methods before implementing a crawler.
- Validate Playwright's runtime needs and the Render cron schedule and cost with the team before enabling collection in a deployed Blueprint.

## Local setup

1. Create `frontend/.env.local` from `frontend/.env.example` and `backend/.env` from the root `.env.example`.
2. Install the frontend dependencies in `frontend/`, then run `npm run dev`.
3. Create a Python virtual environment, install `backend/requirements.txt`, then run `uvicorn app.main:app --reload` from `backend/`.
4. Configure TiDB only after a team-owned development database and credentials are available.
