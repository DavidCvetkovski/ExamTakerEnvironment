"""Unit tests for the import_service parser pipeline."""
import pytest
from app.services.import_service import parse_text


VALID_MCQ = """
#Q What is the arithmetic mean of 2, 4, and 6?
TYPE: MCQ
LEVEL: Remember
DIFFICULTY: Easy
POINTS: 1
TAGS: mean, statistics

A) 2
B) 4 *
C) 6
D) 8
"""

VALID_MCQ_MULTI = """
#Q Select ALL measures of central tendency.
TYPE: MCQ_MULTI
LEVEL: Remember
DIFFICULTY: Easy
POINTS: 2

A) Mean *
B) Range
C) Median *
D) Mode *
"""

VALID_ESSAY = """
#Q Explain the central limit theorem.
TYPE: ESSAY
LEVEL: Understand
DIFFICULTY: Medium
POINTS: 10

MODEL_ANSWER:
The central limit theorem states that the sampling distribution of the mean
approaches a normal distribution as sample size increases.
END_MODEL_ANSWER
"""

FULL_BLUEPRINT = """
#BLUEPRINT
Title: Final Exam
Course: STAT101
Duration: 90
Description: End-of-semester assessment.

#BLOCK Part A: Multiple Choice

#Q What is the mean of 2, 4, 6?
TYPE: MCQ
A) 2
B) 4 *
C) 6

#BLOCK Part B: Essay

#Q Describe variance.
TYPE: ESSAY
"""


def test_parse_valid_mcq():
    result = parse_text(VALID_MCQ)
    assert result.question_count == 1
    assert not result.has_blocking_errors
    q = result.blueprint.all_questions[0]
    assert q.question_type.value == "MCQ"
    assert any(o.is_correct for o in q.options)


def test_parse_valid_mcq_multi():
    result = parse_text(VALID_MCQ_MULTI)
    assert result.question_count == 1
    assert not result.has_blocking_errors
    q = result.blueprint.all_questions[0]
    assert sum(1 for o in q.options if o.is_correct) == 3


def test_parse_valid_essay():
    result = parse_text(VALID_ESSAY)
    assert result.question_count == 1
    assert not result.has_blocking_errors
    q = result.blueprint.all_questions[0]
    assert q.model_answer is not None
    assert "central limit theorem" in q.model_answer.lower()


def test_parse_missing_correct_answer():
    text = """
#Q What is 2+2?
TYPE: MCQ

A) 3
B) 4
C) 5
"""
    result = parse_text(text)
    assert result.has_blocking_errors
    assert any("no correct answer" in e.message.lower() for e in result.errors)
    error_with_line = next((e for e in result.errors if e.line is not None), None)
    assert error_with_line is not None


def test_parse_too_many_correct_for_mcq():
    text = """
#Q What is 2+2?
TYPE: MCQ

A) 3 *
B) 4 *
C) 5
"""
    result = parse_text(text)
    assert result.has_blocking_errors
    assert any("2 correct answers" in e.message for e in result.errors)


def test_parse_unknown_type():
    text = """
#Q What region is highlighted?
TYPE: HOTSPOT
"""
    result = parse_text(text)
    assert result.has_blocking_errors
    assert any("Unknown question type" in e.message for e in result.errors)
    assert any(e.fix_hint and "MCQ" in e.fix_hint for e in result.errors)


def test_parse_full_blueprint_header():
    result = parse_text(FULL_BLUEPRINT)
    assert result.blueprint.header is not None
    assert result.blueprint.header.title == "Final Exam"
    assert result.blueprint.header.course == "STAT101"
    assert result.blueprint.header.duration_minutes == 90
    assert result.blueprint.header.description == "End-of-semester assessment."


def test_parse_multiple_blocks():
    result = parse_text(FULL_BLUEPRINT)
    assert len(result.blueprint.blocks) == 2
    assert result.blueprint.blocks[0].name == "Part A: Multiple Choice"
    assert result.blueprint.blocks[1].name == "Part B: Essay"


def test_parse_empty_input():
    result = parse_text("")
    assert result.has_blocking_errors
    assert any("No questions found" in e.message for e in result.errors)


def test_parse_over_limit():
    lines = []
    for i in range(201):
        lines.append(f"#Q Question number {i}?")
        lines.append("TYPE: MCQ")
        lines.append("A) Yes *")
        lines.append("B) No")
        lines.append("")
    result = parse_text("\n".join(lines))
    assert result.has_blocking_errors
    assert any("Maximum 200" in e.message for e in result.errors)


def test_parse_multiline_stem():
    text = """
#Q This is the first line
of a question stem that
spans multiple lines.
TYPE: MCQ

A) Yes *
B) No
"""
    result = parse_text(text)
    assert result.question_count == 1
    q = result.blueprint.all_questions[0]
    assert "first line" in q.stem
    assert "multiple lines" in q.stem


def test_parse_comment_stripped():
    text = """
// This is a comment and should not appear anywhere
#Q What is 1+1?
TYPE: MCQ

// Another comment
A) 1
B) 2 *
"""
    result = parse_text(text)
    assert result.question_count == 1
    q = result.blueprint.all_questions[0]
    assert "comment" not in q.stem.lower()


def test_parse_duplicate_stem_warning():
    text = """
#Q What is the capital of France?
TYPE: MCQ
A) Paris *
B) Lyon

---

#Q What is the capital of France?
TYPE: MCQ
A) Paris *
B) Lyon
"""
    result = parse_text(text)
    assert not result.has_blocking_errors
    assert any("Duplicate" in w.message for w in result.warnings)


def test_parse_missing_points_defaults():
    text = """
#Q What is 1+1?
TYPE: MCQ
A) 1
B) 2 *
"""
    result = parse_text(text)
    assert result.question_count == 1
    q = result.blueprint.all_questions[0]
    assert q.points == 1


def test_parse_default_block_created():
    text = """
#Q What is 1+1?
TYPE: MCQ
A) 1
B) 2 *
"""
    result = parse_text(text)
    assert len(result.blueprint.blocks) == 1
    assert result.blueprint.blocks[0].name == "General"


# ---------------------------------------------------------------------------
# Epoch 8.7 Stage 3 — TOPIC: writes tags; legacy SUBJECT: maps to tags + warns
# ---------------------------------------------------------------------------

TOPIC_MCQ = """
#Q What is 2+2?
TYPE: MCQ
TOPIC: arithmetic, basic

A) 3
B) 4 *
"""

SUBJECT_MCQ = """
#Q What is 2+2?
TYPE: MCQ
SUBJECT: arithmetic, basic

A) 3
B) 4 *
"""

TAGS_MCQ = """
#Q What is 2+2?
TYPE: MCQ
TAGS: arithmetic, basic

A) 3
B) 4 *
"""


def test_topic_writes_tags():
    """TOPIC: is the canonical metadata key — parsed values land on the
    question's tags list, no warnings."""
    result = parse_text(TOPIC_MCQ)
    assert not result.has_blocking_errors
    q = result.blueprint.all_questions[0]
    assert q.tags == ["arithmetic", "basic"]
    assert not any("deprecated" in e.message.lower() for e in result.warnings)


def test_legacy_subject_still_parses_and_warns():
    """Backward compatibility: SUBJECT: continues to write tags so old
    import files still work, but a WARNING is emitted nudging the user
    toward TOPIC:."""
    result = parse_text(SUBJECT_MCQ)
    assert not result.has_blocking_errors  # warning, not error
    q = result.blueprint.all_questions[0]
    assert q.tags == ["arithmetic", "basic"]
    warnings = [e for e in result.warnings if "subject" in e.message.lower()]
    assert len(warnings) == 1
    assert "deprecated" in warnings[0].message.lower()
    assert "topic" in warnings[0].fix_hint.lower()


def test_legacy_tags_still_parses_and_warns():
    """TAGS: also gets the deprecation nudge toward TOPIC:."""
    result = parse_text(TAGS_MCQ)
    assert not result.has_blocking_errors
    q = result.blueprint.all_questions[0]
    assert q.tags == ["arithmetic", "basic"]
    warnings = [e for e in result.warnings if "tags" in e.message.lower() and "deprecated" in e.message.lower()]
    assert len(warnings) == 1


def test_topic_handles_whitespace_and_empties():
    """`TOPIC: a, , b` should become ['a','b'] — empty splits filtered
    out, surrounding whitespace stripped."""
    text = """
#Q Sample
TYPE: MCQ
TOPIC:   a , , b  , c

A) wrong
B) right *
"""
    result = parse_text(text)
    q = result.blueprint.all_questions[0]
    assert q.tags == ["a", "b", "c"]
