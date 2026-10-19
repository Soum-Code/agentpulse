"""Privacy filter for redacting sensitive data before transport."""

# What this file is for:
#   Holds PrivacyFilter, the small helper that cleans text before the SDK sends it. It
#   hides personal data and secrets (emails, phone numbers, "password: ..." and similar)
#   by replacing them with [REDACTED], and it cuts text that is too long. It also answers
#   "may we keep the text of this input / output / tool result at all?" from the settings.
#
# How it fits in:
#   client.py builds one PrivacyFilter from the CapturePolicy in config.py. decorators.py
#   and integrations/llm.py call redact_text() and should_capture_input() / _output().

from __future__ import annotations

# re = regular expressions (text patterns). Here they find the sensitive pieces of text.
import re
from typing import Any

from agentpulse.config import CapturePolicy


# One filter is shared by all the spans of one AgentPulse client. It only stores the settings
# and the compiled patterns, so the same object can be used again and again.
# In short: the SDK really calls redact_text() and the should_capture_input() / _output()
# methods. filter_dict() is called only by the tests (tests/test_sdk.py).
class PrivacyFilter:
    """Applies privacy controls to telemetry data.
    
    Responsibilities:
    - Redact PII (emails, phones, SSNs) using configurable patterns
    - Detect and mask API keys and secrets
    - Truncate oversized fields
    - Filter excluded field names
    """

    def __init__(self, policy: CapturePolicy) -> None:
        self._policy = policy
        # Compile each pattern string once, here, so redact_text() does not have to rebuild
        # it on every call. re.IGNORECASE makes "EMAIL@X.COM" and "email@x.com" match alike.
        self._compiled_patterns = [
            re.compile(p, re.IGNORECASE) for p in policy.redact_patterns
        ]

    def redact_text(self, text: str | None) -> str | None:
        """Apply all redaction patterns to text."""
        # In: any text, or None. Out: the text with sensitive parts replaced and, if it is
        # too long, cut. None and the empty string come back unchanged.
        if not text:
            return text
        result = text
        # Step 1: run the patterns one after the other. pattern.sub() swaps every match for
        # the word [REDACTED]. What each pattern looks for is explained at redact_patterns
        # in config.py.
        for pattern in self._compiled_patterns:
            result = pattern.sub("[REDACTED]", result)
        # Step 2: cut over-long text. This comes after step 1, so a secret cannot be cut in
        # half first and then slip past the patterns. The "...[TRUNCATED]" marker is added on
        # top of the limit, so the final text can be a little longer than max_field_length.
        if len(result) > self._policy.max_field_length:
            result = result[: self._policy.max_field_length] + "...[TRUNCATED]"
        return result

    def filter_dict(self, data: dict[str, Any]) -> dict[str, Any]:
        """Remove excluded keys and redact string values."""
        # Note: the code does not remove an excluded key. It keeps the key and replaces its
        # value with "[FILTERED]". The input dict is not changed; a new dict is returned.
        # Step 1: the names to hide, in lower case so that "Password" and "password" both match.
        # A key is hidden only when its whole name equals one of these (no partial match).
        excluded = {k.lower() for k in self._policy.excluded_fields}
        result = {}
        for key, value in data.items():
            # Step 2: hide the value of an excluded key.
            if key.lower() in excluded:
                result[key] = "[FILTERED]"
            # Step 3: text values go through the redaction patterns.
            elif isinstance(value, str):
                result[key] = self.redact_text(value)
            # Step 4: a dict inside the dict gets the same treatment (the function calls itself).
            elif isinstance(value, dict):
                result[key] = self.filter_dict(value)
            # Step 5: anything else (numbers, lists, ...) is copied as it is. Text inside a
            # list is therefore NOT redacted.
            else:
                result[key] = value
        return result

    # The next three methods only read a switch in the CapturePolicy (all are False by
    # default, so by default no input / output text is kept). True means "the text may be
    # stored (after redaction)"; False means "do not store the text" (a hash may still be
    # kept; see decorators.py). Only the first two methods are called, by decorators.py and
    # integrations/llm.py.
    def should_capture_input(self) -> bool:
        return self._policy.capture_inputs

    def should_capture_output(self) -> bool:
        return self._policy.capture_outputs

    # Nothing in the SDK calls this one yet (config.py says the same).
    def should_capture_tool_results(self) -> bool:
        return self._policy.capture_tool_results
