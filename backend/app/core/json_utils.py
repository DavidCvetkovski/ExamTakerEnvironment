"""
Core JSON parsing and data structure extraction utilities.
"""
import json
from typing import Any, Dict, List


def parse_json(value: Any) -> Any:
    """Safely parse a value that may already be a dict/list or still a JSON string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return {}
    return value or {}


def extract_choices(options: Any) -> List[Dict[str, Any]]:
    """
    Extract a normalized flat list of option/choice dictionaries from an options container.

    Accepts options as a JSON string, a raw list of options, or a dictionary containing
    keys like 'choices' or 'options' mapping to a list of options.
    """
    parsed = parse_json(options)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        # TipTap and model schemas support both naming conventions
        choices = parsed.get("choices") or parsed.get("options")
        if isinstance(choices, list):
            return choices
    return []
