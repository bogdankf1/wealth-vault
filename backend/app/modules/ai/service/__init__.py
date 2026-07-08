"""
AI Module Service
Business logic for file parsing, AI categorization, and insights.

Composed from cohesive mixins (see the sibling modules in this package):
- CategorizationMixin: statement parsing + AI categorization
- VisionParsingMixin:   OpenAI Vision screenshot parsing
- PresetsMixin:         AI-generated tax/budget presets
"""
import os
from openai import OpenAI

from app.services.ai_categorizer import AICategorizer

from app.modules.ai.service.categorization import CategorizationMixin
from app.modules.ai.service.vision import VisionParsingMixin
from app.modules.ai.service.presets import PresetsMixin


class AIService(CategorizationMixin, VisionParsingMixin, PresetsMixin):
    """Service for AI-powered features"""

    def __init__(self):
        self.categorizer = AICategorizer()
        self._openai_client = None

    @property
    def openai_client(self):
        """Lazy-load OpenAI client"""
        if self._openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key or len(api_key.strip()) == 0:
                raise ValueError("OPENAI_API_KEY environment variable not set or empty")
            self._openai_client = OpenAI(api_key=api_key.strip())
        return self._openai_client


__all__ = ["AIService"]
