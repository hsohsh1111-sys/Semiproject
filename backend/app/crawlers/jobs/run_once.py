"""Single scheduled refresh entry point; no marketplace source is configured yet."""
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("onfit.price-refresh")


def main() -> None:
    logger.info("ONFIT price refresh started.")
    logger.info("No approved collection source is configured; no external pages were contacted.")


if __name__ == "__main__":
    main()
