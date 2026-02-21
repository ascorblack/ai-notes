from datetime import datetime
from pydantic import BaseModel


class SavedMessageCreate(BaseModel):
    content: str
    category_id: int | None = None


class SavedMessageResponse(BaseModel):
    id: int
    category_id: int | None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedMessageCategoryCreate(BaseModel):
    name: str


class SavedMessageCategoryUpdate(BaseModel):
    name: str | None = None


class SavedMessageCategoryResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedMessageTrashItem(BaseModel):
    id: int
    content: str
    category_id: int | None
    deleted_at: datetime

    model_config = {"from_attributes": True}
