"""
OpenTelemetry tracing for QA RAG Platform.

Instruments:
  - All agent runs (span per agent, attributes: agent_name, task_type, team_id, tokens, latency)
  - FastAPI HTTP requests (via opentelemetry-instrumentation-fastapi)
  - RAG hybrid search calls
  - LLM calls (Groq)

Exporters (configured via env vars):
  OTEL_EXPORTER_OTLP_ENDPOINT  — gRPC OTLP endpoint (e.g. http://localhost:4317)
                                   Grafana Tempo, Jaeger, Honeycomb, Datadog Agent
  OTEL_CONSOLE_EXPORT=true     — log spans to console (dev fallback, always on if no endpoint)
  OTEL_SERVICE_NAME            — service name tag (default: qa-rag-platform)

Usage:
  # In app startup (main.py / app.py):
  from backend.telemetry import setup_telemetry, get_tracer
  setup_telemetry(app)   # call once at startup

  # In any code:
  from backend.telemetry import get_tracer
  with get_tracer().start_as_current_span("my-operation") as span:
      span.set_attribute("key", "value")
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_tracer = None
_setup_done = False


def setup_telemetry(app=None) -> None:
    """
    Initialise the OpenTelemetry TracerProvider.
    Call once at application startup. Safe to call multiple times (idempotent).
    """
    global _tracer, _setup_done
    if _setup_done:
        return
    _setup_done = True

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import (
            BatchSpanProcessor,
            ConsoleSpanExporter,
            SimpleSpanProcessor,
        )
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME

        service_name = os.getenv("OTEL_SERVICE_NAME", "qa-rag-platform")
        resource = Resource(attributes={SERVICE_NAME: service_name})
        provider = TracerProvider(resource=resource)

        exporters_configured = 0

        # 1. OTLP gRPC exporter (Grafana Tempo / Jaeger / Datadog)
        otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
        if otlp_endpoint:
            try:
                from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
                otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
                provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
                logger.info("OTEL: OTLP exporter → %s", otlp_endpoint)
                exporters_configured += 1
            except Exception as exc:
                logger.warning("OTEL: OTLP exporter failed to init: %s", exc)

        # 2. Console exporter (dev mode / always-on fallback)
        if os.getenv("OTEL_CONSOLE_EXPORT", "").lower() == "true" or exporters_configured == 0:
            provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
            if exporters_configured == 0:
                logger.info("OTEL: No OTLP endpoint — using console exporter (dev mode)")

        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer("qa-rag-platform", "6.0.0")

        # 3. FastAPI auto-instrumentation
        if app is not None:
            try:
                from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
                FastAPIInstrumentor.instrument_app(app)
                logger.info("OTEL: FastAPI auto-instrumentation enabled")
            except Exception as exc:
                logger.warning("OTEL: FastAPI instrumentation failed: %s", exc)

        logger.info("OTEL: Telemetry initialised (service=%s)", service_name)

    except ImportError as exc:
        logger.warning("OTEL: opentelemetry packages not available (%s) — tracing disabled", exc)
    except Exception as exc:
        logger.warning("OTEL: Setup failed (%s) — tracing disabled", exc)


def get_tracer():
    """Return the global tracer. Returns a no-op tracer if setup hasn't run."""
    global _tracer
    if _tracer is not None:
        return _tracer
    try:
        from opentelemetry import trace
        return trace.get_tracer("qa-rag-platform")
    except ImportError:
        return _NoOpTracer()


class _NoOpSpan:
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def set_attribute(self, *args): pass
    def set_status(self, *args): pass
    def record_exception(self, *args): pass


class _NoOpTracer:
    def start_as_current_span(self, name, **kwargs):
        return _NoOpSpan()
    def start_span(self, name, **kwargs):
        return _NoOpSpan()


# ── Decorator helpers ──────────────────────────────────────────────────────────

def trace_agent_run(agent_name: str, task_type: str, team_id: Optional[str] = None):
    """
    Context manager that wraps an agent run in an OTEL span.

    Usage:
        with trace_agent_run("rca_agent", "rca", team_id=task.team_id) as span:
            result = agent.run(task)
            span.set_attribute("tokens_used", result.tokens_used)
    """
    tracer = get_tracer()
    span = tracer.start_as_current_span(
        f"agent.run/{agent_name}",
    )

    class _SpanCtx:
        def __enter__(self):
            self._span = span.__enter__()
            try:
                self._span.set_attribute("agent.name",      agent_name)
                self._span.set_attribute("agent.task_type", task_type)
                if team_id:
                    self._span.set_attribute("agent.team_id", team_id)
            except Exception:
                pass
            return self._span

        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_type is not None:
                try:
                    from opentelemetry.trace import StatusCode
                    self._span.set_status(StatusCode.ERROR, str(exc_val)[:200])
                    self._span.record_exception(exc_val)
                except Exception:
                    pass
            return span.__exit__(exc_type, exc_val, exc_tb)

    return _SpanCtx()


def trace_search(query_text: str, backend: str = "hybrid"):
    """Context manager for wrapping a hybrid search call in an OTEL span."""
    tracer = get_tracer()
    span = tracer.start_as_current_span(f"search.{backend}")

    class _Ctx:
        def __enter__(self):
            self._span = span.__enter__()
            try:
                self._span.set_attribute("search.query_length", len(query_text))
                self._span.set_attribute("search.backend", backend)
            except Exception:
                pass
            return self._span
        def __exit__(self, *args):
            return span.__exit__(*args)

    return _Ctx()
