FROM langflowai/langflow:latest

USER root

COPY FlakyDiff.py /tmp/flaky_diff_src.py
COPY setup.py /tmp/setup.py
RUN python3 /tmp/setup.py

COPY flaky_analyzer.langflow.json /app/flows/flaky_analyzer.langflow.json
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV LANGFLOW_AUTO_LOGIN=false
ENV LANGFLOW_SUPERUSER=admin
# LANGFLOW_SUPERUSER_PASSWORD must be set as a Secret in HF Space settings (never hardcode it)

EXPOSE 7860

ENTRYPOINT ["/app/docker-entrypoint.sh"]
