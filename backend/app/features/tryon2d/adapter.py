"""Transport-neutral contract for a future local/separate GPU process.

Inputs are validated encoded PNG/JPEG/WEBP bytes, never user filenames or server
paths. An actual engine must apply EXIF orientation and convert images to RGB.
No torch, model weights, paid API, or inference implementation is imported here.
"""
from dataclasses import dataclass
from typing import Protocol

from app.features.tryon2d.schemas import Category


@dataclass(frozen=True)
class InferenceInput:
    person_image: bytes
    garment_image: bytes
    category: Category


@dataclass(frozen=True)
class InferenceOutput:
    image: bytes | None = None
    error_code: str | None = None

    def __post_init__(self):
        if (self.image is None) == (self.error_code is None):
            raise ValueError('Return exactly one generated image or explicit failure code')


class TryOnAdapter(Protocol):
    @property
    def connected(self) -> bool: ...

    def infer(self, inputs: InferenceInput) -> InferenceOutput: ...


class UnconnectedAdapter:
    connected = False

    def infer(self, inputs: InferenceInput) -> InferenceOutput:
        return InferenceOutput(error_code='model_not_connected')
