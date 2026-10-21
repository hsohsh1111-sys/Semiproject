from pydantic import BaseModel


class Product(BaseModel):
    id: str
    name: str
    category: str
    price: int
    image: str
    tag: str = "ONFIT PICK"
