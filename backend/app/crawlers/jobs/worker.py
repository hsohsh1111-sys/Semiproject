"""Long-running worker entry point. Replace the placeholder with the agreed schedule."""
import asyncio
import logging

from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("onfit.worker")


async def run() -> None:
    logger.info("ONFIT price worker started; interval=%s hours", settings.collection_interval_hours)
    while True:
        logger.info("Price refresh is not configured yet; no external sources were contacted.")
        await asyncio.sleep(max(settings.collection_interval_hours, 1) * 60 * 60)


if __name__ == "__main__":
    asyncio.run(run())
