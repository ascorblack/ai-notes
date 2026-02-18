from pydantic import BaseModel


class AgentSettingsResponse(BaseModel):
    base_url: str
    model: str
    api_key_set: bool
    temperature: float
    frequency_penalty: float
    top_p: float
    max_tokens: int


class AgentSettingsUpdate(BaseModel):
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None
    temperature: float | None = None
    frequency_penalty: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None


class ProfileFactItem(BaseModel):
    id: int
    fact: str


class ProfileFactUpdate(BaseModel):
    fact: str


class ProfileFactsResponse(BaseModel):
    facts: list[ProfileFactItem]


class AgentProcessRequest(BaseModel):
    user_input: str
    note_id: int | None = None  # открытая заметка — для дополнения/редактирования


class AgentProcessResponse(BaseModel):
    affected_ids: list[int]
    created_ids: list[int]
    skipped: bool | None = None
    reason: str | None = None
    unknown_intent: bool | None = None  # True when classifier could not understand request
