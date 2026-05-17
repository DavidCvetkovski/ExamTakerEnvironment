from dataclasses import dataclass
from enum import Enum, auto
from typing import Iterator

METADATA_KEYS = {"TYPE", "LEVEL", "DIFFICULTY", "POINTS", "TAGS", "TOPIC", "SUBJECT", "TITLE", "COURSE", "DURATION", "DESCRIPTION"}


class TokenType(Enum):
    COMMENT = auto()
    BLUEPRINT_HEADER = auto()
    BLUEPRINT_FIELD = auto()
    BLOCK_HEADER = auto()
    SEPARATOR = auto()
    QUESTION_START = auto()
    STEM_CONTINUATION = auto()
    METADATA = auto()
    OPTION = auto()
    MODEL_ANSWER_START = auto()
    MODEL_ANSWER_LINE = auto()
    MODEL_ANSWER_END = auto()
    BLANK = auto()


@dataclass
class Token:
    type: TokenType
    value: str
    raw: str
    line: int


def tokenize(text: str) -> Iterator[Token]:
    """Yield Token objects for each line of text."""
    in_model_answer = False
    for lineno, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()

        if in_model_answer:
            if stripped == "END_MODEL_ANSWER":
                in_model_answer = False
                yield Token(TokenType.MODEL_ANSWER_END, stripped, raw, lineno)
            else:
                yield Token(TokenType.MODEL_ANSWER_LINE, raw, raw, lineno)
            continue

        if not stripped:
            yield Token(TokenType.BLANK, "", raw, lineno)
        elif stripped.startswith("//"):
            yield Token(TokenType.COMMENT, stripped[2:].strip(), raw, lineno)
        elif stripped == "#BLUEPRINT":
            yield Token(TokenType.BLUEPRINT_HEADER, "", raw, lineno)
        elif stripped.startswith("#BLOCK "):
            yield Token(TokenType.BLOCK_HEADER, stripped[7:].strip(), raw, lineno)
        elif stripped == "---":
            yield Token(TokenType.SEPARATOR, "", raw, lineno)
        elif stripped.startswith("#Q ") or stripped == "#Q":
            yield Token(TokenType.QUESTION_START, stripped[3:].strip(), raw, lineno)
        elif stripped == "MODEL_ANSWER:":
            in_model_answer = True
            yield Token(TokenType.MODEL_ANSWER_START, "", raw, lineno)
        elif ":" in stripped and stripped.split(":")[0].strip().upper() in METADATA_KEYS:
            key, _, val = stripped.partition(":")
            yield Token(TokenType.METADATA, f"{key.strip().upper()}:{val.strip()}", raw, lineno)
        elif len(stripped) >= 2 and stripped[1] == ")" and stripped[0].isalpha():
            yield Token(TokenType.OPTION, stripped, raw, lineno)
        else:
            yield Token(TokenType.STEM_CONTINUATION, stripped, raw, lineno)
