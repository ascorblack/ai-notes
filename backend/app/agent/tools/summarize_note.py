"""Agent tool for summarizing note content."""

import logging

from app.agent.llm_client import LLMClient
from app.services import workspace

logger = logging.getLogger(__name__)


async def summarize_note(user_id: int, note_id: int) -> str:
    """Summarize note content into 3-5 theses.

    Returns callout block string.
    """
    content = workspace.get_content(user_id, note_id)
    if not content:
        return ""

    prompt = f"""Please summarize the following note into 3-5 key theses (bullets).
Note content:
{content}

Requirements:
- Return ONLY the summary in the format shown below
- Use the same language as the note (Russian/English)
- Format: > **Summary** followed by bullets

Format example:
> **Summary**
- Bullet 1
- Bullet 2
- Bullet 3
"""

    try:
        llm = LLMClient()
        response = await llm.complete(prompt)
        lines = [line.strip() for line in response.strip().split("\n") if line.strip()]
        summary_lines = [line for line in lines if line and not line.startswith("Summary") and not line.startswith("-") is False]

        if not summary_lines:
            return ""

        summary_block = "\n".join(["> **Summary**", *summary_lines[:5]])
        return f"\n{summary_block}\n"
    except Exception as e:
        logger.warning("Failed to summarize note", extra={"note_id": note_id, "error": str(e)})
        raise
