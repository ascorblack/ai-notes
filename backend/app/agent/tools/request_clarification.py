"""Agent tool for requesting clarification from user."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class ClarificationNeeded(Exception):
    """Raised when agent needs user clarification to proceed."""

    def __init__(self, question: str, tool: str, params: dict[str, Any], context: dict[str, Any]):
        self.question = question
        self.tool = tool
        self.params = params
        self.context = context
        super().__init__(question)


async def request_clarification(
    question: str,
    tool: str,
    params: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> ClarificationNeeded:
    """Request clarification from user.

    Raises ClarificationNeeded exception that should be caught by the stream handler.
    """
    raise ClarificationNeeded(
        question=question,
        tool=tool,
        params=params,
        context=context or {},
    )
