FROM langflowai/langflow:latest

USER root

# Copy all 4 custom components to a temp staging area
COPY components/BugConnectorNormalizer.py /tmp/bug_connector_normalizer_src.py
COPY components/RiskScoringEngine.py      /tmp/risk_scoring_engine_src.py
COPY components/DuplicateDetector.py      /tmp/duplicate_detector_src.py
COPY components/ConfidenceRouter.py       /tmp/confidence_router_src.py

# Run setup: normalizes langflow/lfx imports and writes to /app/custom_components/
COPY setup.py /tmp/setup.py
RUN python3 /tmp/setup.py

# Copy flow JSON and knowledge base for auto-import on first boot
COPY bug_triage_agent.langflow.json /app/flows/bug_triage_agent.langflow.json
COPY knowledge_base/historical_bugs.json /app/flows/historical_bugs.json

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV LANGFLOW_AUTO_LOGIN=true
ENV LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true
ENV LANGFLOW_SUPERUSER=langflow
ENV LANGFLOW_SUPERUSER_PASSWORD=langflow

EXPOSE 7860

ENTRYPOINT ["/app/docker-entrypoint.sh"]
