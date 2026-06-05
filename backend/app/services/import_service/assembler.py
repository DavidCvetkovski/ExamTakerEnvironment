from enum import Enum, auto
from typing import Iterable, Optional

from .lexer import Token, TokenType
from .schemas import (
    BloomsLevel,
    Difficulty,
    ParseError,
    ParseErrorSeverity,
    ParsedBlock,
    ParsedBlueprint,
    ParsedBlueprintHeader,
    ParsedOption,
    ParsedQuestion,
    ParsedQuestionType,
)

DEFAULT_BLOCK_NAME = "General"


class AssemblerState(Enum):
    ROOT = auto()
    IN_BLUEPRINT_HEADER = auto()
    IN_BLOCK = auto()
    IN_QUESTION = auto()
    IN_MODEL_ANSWER = auto()


class Assembler:
    def assemble(self, tokens: Iterable[Token]) -> tuple[ParsedBlueprint, list[ParseError]]:
        self._state = AssemblerState.ROOT
        self._errors: list[ParseError] = []
        self._header: Optional[ParsedBlueprintHeader] = None
        self._blocks: list[ParsedBlock] = []
        self._current_block_name: Optional[str] = None
        self._current_block_questions: list[ParsedQuestion] = []
        self._current_q: Optional[dict] = None  # accumulator dict

        for token in tokens:
            self._dispatch(token)

        self._finalise_question()
        self._finalise_block()

        blueprint = ParsedBlueprint(
            header=self._header,
            blocks=self._blocks,
        )
        return blueprint, self._errors

    # --- dispatch ---

    def _dispatch(self, token: Token) -> None:
        t = token.type

        if t in (TokenType.BLANK, TokenType.SEPARATOR, TokenType.COMMENT):
            return

        if t == TokenType.BLUEPRINT_HEADER:
            self._finalise_question()
            self._header = ParsedBlueprintHeader()
            self._state = AssemblerState.IN_BLUEPRINT_HEADER
            return

        if t == TokenType.BLOCK_HEADER:
            self._finalise_question()
            self._finalise_block()
            self._current_block_name = token.value
            self._state = AssemblerState.IN_BLOCK
            return

        if t == TokenType.QUESTION_START:
            self._finalise_question()
            if self._current_block_name is None:
                self._current_block_name = DEFAULT_BLOCK_NAME
            self._current_q = {
                "stem_parts": [token.value] if token.value else [],
                "question_type": None,
                "bloom_level": BloomsLevel.REMEMBER,
                "difficulty": Difficulty.MEDIUM,
                "points": 1,
                "tags": [],
                "options": [],
                "model_answer_lines": None,
                "source_line": token.line,
            }
            self._state = AssemblerState.IN_QUESTION
            return

        if t == TokenType.MODEL_ANSWER_START:
            if self._state != AssemblerState.IN_QUESTION:
                self._errors.append(ParseError(
                    line=token.line,
                    message="MODEL_ANSWER: found outside a question block.",
                    severity=ParseErrorSeverity.ERROR,
                    fix_hint="Move MODEL_ANSWER: inside a #Q block.",
                ))
                return
            self._current_q["model_answer_lines"] = []
            self._state = AssemblerState.IN_MODEL_ANSWER
            return

        if t == TokenType.MODEL_ANSWER_LINE:
            if self._state == AssemblerState.IN_MODEL_ANSWER and self._current_q is not None:
                self._current_q["model_answer_lines"].append(token.value)
            return

        if t == TokenType.MODEL_ANSWER_END:
            if self._state == AssemblerState.IN_MODEL_ANSWER:
                self._state = AssemblerState.IN_QUESTION
            else:
                self._errors.append(ParseError(
                    line=token.line,
                    message="END_MODEL_ANSWER found without a matching MODEL_ANSWER:.",
                    severity=ParseErrorSeverity.ERROR,
                ))
            return

        if t == TokenType.METADATA:
            self._handle_metadata(token)
            return

        if t == TokenType.OPTION:
            self._handle_option(token)
            return

        if t == TokenType.STEM_CONTINUATION:
            if self._state == AssemblerState.IN_QUESTION and self._current_q is not None:
                if self._current_q["question_type"] is None:
                    self._current_q["stem_parts"].append(token.value)
            return

    # --- helpers ---

    def _handle_metadata(self, token: Token) -> None:
        key, _, val = token.value.partition(":")
        val = val.strip()

        if self._state == AssemblerState.IN_BLUEPRINT_HEADER and self._header is not None:
            if key == "TITLE":
                self._header.title = val
            elif key == "COURSE":
                self._header.course = val
            elif key == "DURATION":
                try:
                    self._header.duration_minutes = int(val)
                except ValueError:
                    self._errors.append(ParseError(
                        line=token.line,
                        message=f"Duration '{val}' is not a valid integer.",
                        severity=ParseErrorSeverity.ERROR,
                        fix_hint="Duration must be a whole number of minutes ≥ 1.",
                    ))
            elif key == "DESCRIPTION":
                self._header.description = val
            return

        if self._state in (AssemblerState.IN_QUESTION, AssemblerState.IN_MODEL_ANSWER) and self._current_q is not None:
            if key == "TYPE":
                type_map = {"MCQ": ParsedQuestionType.MCQ, "MCQ_MULTI": ParsedQuestionType.MCQ_MULTI, "ESSAY": ParsedQuestionType.ESSAY}
                if val.upper() in type_map:
                    self._current_q["question_type"] = type_map[val.upper()]
                else:
                    self._errors.append(ParseError(
                        line=token.line,
                        message=f"Unknown question type '{val}'.",
                        severity=ParseErrorSeverity.ERROR,
                        fix_hint="Allowed values: MCQ, MCQ_MULTI, ESSAY.",
                    ))
            elif key == "LEVEL":
                level_map = {level.value.upper(): level for level in BloomsLevel}
                if val.title() in {level.value for level in BloomsLevel}:
                    self._current_q["bloom_level"] = BloomsLevel(val.title())
                elif val.upper() in level_map:
                    self._current_q["bloom_level"] = level_map[val.upper()]
                # unrecognised levels are caught by validator
            elif key == "DIFFICULTY":
                diff_map = {d.value.upper(): d for d in Difficulty}
                if val.upper() in diff_map:
                    self._current_q["difficulty"] = diff_map[val.upper()]
                # unrecognised values caught by validator
            elif key == "POINTS":
                try:
                    pts = int(val)
                    self._current_q["points"] = pts
                except ValueError:
                    self._errors.append(ParseError(
                        line=token.line,
                        message=f"POINTS value '{val}' is not a valid integer.",
                        severity=ParseErrorSeverity.ERROR,
                        fix_hint="POINTS must be a whole number ≥ 1.",
                    ))
            elif key == "TOPIC":
                self._current_q["tags"] = [t.strip() for t in val.split(",") if t.strip()]
            elif key == "SUBJECT":
                self._current_q["tags"] = [t.strip() for t in val.split(",") if t.strip()]
                self._errors.append(ParseError(
                    line=token.line,
                    message="SUBJECT: is deprecated; use TOPIC: instead.",
                    severity=ParseErrorSeverity.WARNING,
                    fix_hint="Replace `SUBJECT:` with `TOPIC:`.",
                ))
            elif key == "TAGS":
                self._current_q["tags"] = [t.strip() for t in val.split(",") if t.strip()]
                self._errors.append(ParseError(
                    line=token.line,
                    message="TAGS: is deprecated; use TOPIC: instead.",
                    severity=ParseErrorSeverity.WARNING,
                    fix_hint="Replace `TAGS:` with `TOPIC:` for clarity.",
                ))

    def _handle_option(self, token: Token) -> None:
        if self._state not in (AssemblerState.IN_QUESTION, AssemblerState.IN_MODEL_ANSWER) or self._current_q is None:
            self._errors.append(ParseError(
                line=token.line,
                message="Answer option found outside a question block.",
                severity=ParseErrorSeverity.ERROR,
                fix_hint="Move this option line after a #Q line.",
            ))
            return

        raw = token.value
        letter = raw[0]
        rest = raw[2:].strip()  # strip "A) "
        is_correct = rest.endswith(" *") or rest == "*"
        text = rest[:-2].strip() if rest.endswith(" *") else (rest[:-1].strip() if rest == "*" else rest)

        self._current_q["options"].append(ParsedOption(letter=letter, text=text, is_correct=is_correct))

    def _finalise_question(self) -> None:
        if self._current_q is None:
            return

        stem = " ".join(self._current_q["stem_parts"]).strip()
        model_answer_lines = self._current_q.get("model_answer_lines")
        model_answer = "\n".join(model_answer_lines).strip() if model_answer_lines is not None else None

        q = ParsedQuestion(
            stem=stem,
            question_type=self._current_q["question_type"] or ParsedQuestionType.MCQ,
            bloom_level=self._current_q["bloom_level"],
            difficulty=self._current_q["difficulty"],
            points=self._current_q["points"],
            tags=self._current_q["tags"],
            options=self._current_q["options"],
            model_answer=model_answer,
            source_line=self._current_q["source_line"],
        )
        self._current_block_questions.append(q)
        self._current_q = None
        self._state = AssemblerState.IN_BLOCK if self._current_block_name else AssemblerState.ROOT

    def _finalise_block(self) -> None:
        if self._current_block_name is None and not self._current_block_questions:
            return
        name = self._current_block_name or DEFAULT_BLOCK_NAME
        self._blocks.append(ParsedBlock(name=name, questions=self._current_block_questions))
        self._current_block_questions = []
        self._current_block_name = None
