from datetime import datetime

from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: str
    content: str = ""
    folder_id: int | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    folder_id: int | None = None


class NoteResponse(BaseModel):
    id: int
    folder_id: int | None
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TrashItem(BaseModel):
    id: int
    title: str
    folder_id: int | None
    deleted_at: datetime
