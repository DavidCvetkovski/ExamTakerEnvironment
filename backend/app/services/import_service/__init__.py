from .assembler import Assembler
from .lexer import tokenize
from .validator import Validator
from .schemas import ParseResult, ParsedBlueprint, ParseError, PersistResult
from .persister import persist_import

__all__ = [
    "Assembler",
    "tokenize",
    "Validator",
    "ParseResult",
    "ParsedBlueprint",
    "ParseError",
    "PersistResult",
    "persist_import",
    "parse_text",
]


def parse_text(raw_text: str) -> ParseResult:
    """Parse raw import text. Returns ParseResult with blueprint and any errors/warnings.

    Callers check `result.has_blocking_errors` before allowing a commit.
    """
    tokens = list(tokenize(raw_text))
    blueprint, structural_errors = Assembler().assemble(tokens)
    validation_errors = Validator().validate(blueprint)
    all_errors = structural_errors + validation_errors

    # Also check for Word-style pasted content with no #Q markers
    hints: list[ParseError] = []
    if not any(t.raw.strip().startswith("#Q") for t in tokens):
        import re
        if re.search(r"^\s*(\d+[\.\)]\s|Q\d+[\.\)]\s)", raw_text, re.MULTILINE):
            hints.append(ParseError(
                message="No `#Q` markers found. Did you paste from a Word document? Add `#Q` before each question stem.",
                severity="warning",
                fix_hint="Prefix each question with `#Q`, e.g. `#Q What is the capital of France?`",
            ))

    return ParseResult(
        blueprint=blueprint,
        errors=[e for e in all_errors if e.severity == "error"],
        warnings=[e for e in all_errors if e.severity == "warning"] + hints,
    )
