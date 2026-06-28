import re
import shlex
import json
from typing import Optional
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema import Data


class CurlParser(Component):
    display_name = "cURL Parser"
    description = "Parses one or more cURL commands into structured API request objects."
    icon = "code"

    inputs = [
        MessageTextInput(
            name="curl_input",
            display_name="cURL Commands",
            info="Paste one or more cURL commands, one per line block.",
        )
    ]

    outputs = [
        Output(display_name="Parsed Requests", name="parsed_requests", method="parse_curls")
    ]

    def parse_curls(self) -> Data:
        raw = self.curl_input.strip()
        curl_blocks = re.split(r"\n(?=curl\s)", raw, flags=re.IGNORECASE)
        results = []
        for block in curl_blocks:
            block = block.strip()
            if block.lower().startswith("curl"):
                parsed = self._parse_single_curl(block)
                if parsed:
                    results.append(parsed)
        return Data(data={"requests": results})

    def _parse_single_curl(self, curl: str) -> Optional[dict]:
        try:
            curl_clean = curl.replace("\\\n", " ").replace("\\", "")
            tokens = shlex.split(curl_clean)
        except ValueError:
            return None

        request = {
            "method": "GET",
            "url": "",
            "headers": {},
            "body": None,
            "cookies": {},
            "auth": None,
        }

        i = 1
        while i < len(tokens):
            token = tokens[i]

            if token in ("-X", "--request") and i + 1 < len(tokens):
                request["method"] = tokens[i + 1].upper()
                i += 2

            elif token in ("-H", "--header") and i + 1 < len(tokens):
                header_line = tokens[i + 1]
                if ":" in header_line:
                    key, _, value = header_line.partition(":")
                    request["headers"][key.strip()] = value.strip()
                i += 2

            elif token in ("-d", "--data", "--data-raw", "--data-binary") and i + 1 < len(tokens):
                request["body"] = tokens[i + 1]
                if request["method"] == "GET":
                    request["method"] = "POST"
                i += 2

            elif token in ("-u", "--user") and i + 1 < len(tokens):
                request["auth"] = {"type": "basic", "value": tokens[i + 1]}
                i += 2

            elif token in ("-b", "--cookie") and i + 1 < len(tokens):
                cookie_str = tokens[i + 1]
                for pair in cookie_str.split(";"):
                    if "=" in pair:
                        k, _, v = pair.strip().partition("=")
                        request["cookies"][k.strip()] = v.strip()
                i += 2

            elif not token.startswith("-"):
                if not request["url"]:
                    request["url"] = token
                i += 1

            else:
                i += 1

        try:
            if request["body"]:
                request["body"] = json.loads(request["body"])
        except (json.JSONDecodeError, TypeError):
            pass

        return request
