from datetime import datetime

from pydantic import BaseModel


class FolderCreate(BaseModel):
    name: str
    parent_folder_id: int | None = None
    order_index: int = 0


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_folder_id: int | None = None
    order_index: int | None = None


class FolderResponse(BaseModel):
    id: int
    name: str
    parent_folder_id: int | None
    order_index: int

    model_config = {"from_attributes": True}


class FolderTree(FolderResponse):
    children: list["FolderTree"] = []
    notes: list["NoteRef"] = []


class NoteRef(BaseModel):
    id: int
    title: str
    pinned: bool = False
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class FolderTreeResponse(BaseModel):
    roots: list[FolderTree] = []
    root_notes: list[NoteRef] = []


FolderTree.model_rebuild()
