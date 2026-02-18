from pydantic import BaseModel


class ChatMessageRequest(BaseModel):
    content: str


class ChatSessionPatch(BaseModel):
    title: str | None = None


class RegenerateRequest(BaseModel):
    message_id: int


class ChatSettingsResponse(BaseModel):
    temperature: float
    frequency_penalty: float
    top_p: float
    max_tokens: int


class ChatSettingsUpdate(BaseModel):
    temperature: float | None = None
    frequency_penalty: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
