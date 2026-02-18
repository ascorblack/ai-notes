"""Base class for agent tools."""

from abc import ABC, abstractmethod


class BaseTool(ABC):
    """Base class for agent tools. Returns string result."""

    @abstractmethod
    async def call(self, **kwargs) -> str:
        """Execute tool and return text result."""
        raise NotImplementedError
