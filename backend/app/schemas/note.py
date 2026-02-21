from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class SubtaskItem(BaseModel):
    text: str
    done: bool = False


class TagBrief(BaseModel):
    id: int
    name: str
    color: str | None = None


class BatchMoveRequest(BaseModel):
    note_ids: list[int]
    target_folder_id: int | None = None


class BatchDeleteRequest(BaseModel):
    note_ids: list[int]


class NoteCreate(BaseModel):
    title: str
    content: str = ""
    folder_id: int | None = None
    is_task: bool = False
    subtasks: list[SubtaskItem] | None = None
    deadline: datetime | None = None
    priority: Literal["high", "medium", "low"] | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    folder_id: int | None = None
    is_task: bool | None = None
    subtasks: list[SubtaskItem] | None = None
    deadline: datetime | None = None
    priority: Literal["high", "medium", "low"] | None = None
    pinned: bool | None = None


class NoteResponse(BaseModel):
    id: int
    folder_id: int | None
    title: str
    content: str
    created_at: datetime
    updated_at: datetime
    is_task: bool = False
    subtasks: list[dict[str, Any]] | None = None
    completed_at: datetime | None = None
    deadline: datetime | None = None
    priority: str | None = "medium"
    tags: list[TagBrief] = []
    pinned: bool = False
    created: bool = False  # True when daily note was just created (GET /daily only)

    model_config = {"from_attributes": True}


class TaskResponse(BaseModel):
    id: int
    title: str
    content: str
    subtasks: list[dict[str, Any]] | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    folder_id: int | None = None
    deadline: datetime | None = None
    priority: str | None = "medium"
    task_status: str | None = "backlog"

    model_config = {"from_attributes": True}


class TaskCategory(BaseModel):
    id: int
    name: str


class TrashItem(BaseModel):
    id: int
    title: str
    folder_id: int | None
    deleted_at: datetime
