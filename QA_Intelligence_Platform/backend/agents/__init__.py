"""
Agent Engine — specialized AI agents sharing the same Knowledge Layer.

All agents use RetrievalEngine internally. No agent calls Qdrant or the LLM directly.
"""
from .base_agent import BaseAgent
from .qa_assistant import QAAssistant
from .rca_agent import RCAAgent
from .flaky_test_agent import FlakyTestAgent
from .rtm_builder import RTMBuilder
from .coverage_analyzer import CoverageAnalyzer

AGENT_REGISTRY = {
    "qa_assistant":     QAAssistant,
    "rca":              RCAAgent,
    "flaky_test":       FlakyTestAgent,
    "rtm_builder":      RTMBuilder,
    "coverage_analyzer": CoverageAnalyzer,
}

__all__ = [
    "BaseAgent", "QAAssistant", "RCAAgent",
    "FlakyTestAgent", "RTMBuilder", "CoverageAnalyzer",
    "AGENT_REGISTRY",
]
