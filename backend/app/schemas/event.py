from datetime import datetime

from pydantic import BaseModel


class EventResponse(BaseModel):
    id: int
    note_id: int
    title: str
    starts_at: datetime
    ends_at: datetime

    model_config = {"from_attributes": True}
