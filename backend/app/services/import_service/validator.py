from .schemas import (
    BloomsLevel,
    Difficulty,
    ParseError,
    ParseErrorSeverity,
    ParsedBlueprint,
    ParsedQuestion,
    ParsedQuestionType,
)

MAX_QUESTIONS = 200


class Validator:
    def validate(self, blueprint: ParsedBlueprint) -> list[ParseError]:
        errors: list[ParseError] = []
        all_questions = blueprint.all_questions

        if not all_questions:
            errors.append(ParseError(
                message="No questions found. Ensure each question starts with `#Q`.",
                severity=ParseErrorSeverity.ERROR,
                fix_hint="Add at least one `#Q <question text>` line.",
            ))
            return errors

        if len(all_questions) > MAX_QUESTIONS:
            errors.append(ParseError(
                message=f"Maximum {MAX_QUESTIONS} questions per import. Found {len(all_questions)}.",
                severity=ParseErrorSeverity.ERROR,
                fix_hint="Split into multiple pastes.",
            ))

        if blueprint.header and blueprint.header.duration_minutes is not None:
            if blueprint.header.duration_minutes <= 0:
                errors.append(ParseError(
                    message="Blueprint duration must be ≥ 1 minute.",
                    severity=ParseErrorSeverity.ERROR,
                    fix_hint="Set `Duration:` to a positive integer.",
                ))

        stems_seen: dict[str, int] = {}
        for q in all_questions:
            errors.extend(self._validate_question(q))
            normalised = q.stem.lower().strip()
            if normalised in stems_seen:
                errors.append(ParseError(
                    line=q.source_line,
                    message=f"Duplicate question stem (same as line {stems_seen[normalised]}).",
                    severity=ParseErrorSeverity.WARNING,
                    fix_hint="Verify this is intentional.",
                ))
            else:
                stems_seen[normalised] = q.source_line

        for block in blueprint.blocks:
            if not block.questions:
                errors.append(ParseError(
                    message=f"Block '{block.name}' has no questions.",
                    severity=ParseErrorSeverity.WARNING,
                    fix_hint="Add at least one `#Q` after the `#BLOCK` line, or remove the block.",
                ))

        return errors

    def _validate_question(self, q: ParsedQuestion) -> list[ParseError]:
        errors: list[ParseError] = []

        if not q.stem:
            errors.append(ParseError(
                line=q.source_line,
                message="Question stem is empty.",
                severity=ParseErrorSeverity.ERROR,
                fix_hint="The `#Q` line must contain the question text.",
            ))

        if q.points < 1:
            errors.append(ParseError(
                line=q.source_line,
                message=f"POINTS value {q.points} is invalid.",
                severity=ParseErrorSeverity.ERROR,
                fix_hint="POINTS must be a whole number ≥ 1.",
            ))

        if q.question_type in (ParsedQuestionType.MCQ, ParsedQuestionType.MCQ_MULTI):
            if not q.options:
                errors.append(ParseError(
                    line=q.source_line,
                    message=f"{q.question_type.value} question has no answer options.",
                    severity=ParseErrorSeverity.ERROR,
                    fix_hint="Add at least two options starting with a letter and `)`, e.g. `A) Option text`.",
                ))
            else:
                correct_count = sum(1 for o in q.options if o.is_correct)

                if len(q.options) < 2:
                    errors.append(ParseError(
                        line=q.source_line,
                        message=f"Fewer than 2 options provided ({len(q.options)}).",
                        severity=ParseErrorSeverity.WARNING,
                        fix_hint="Consider adding more distractors.",
                    ))

                if q.question_type == ParsedQuestionType.MCQ:
                    if correct_count == 0:
                        errors.append(ParseError(
                            line=q.source_line,
                            message="MCQ question has no correct answer marked.",
                            severity=ParseErrorSeverity.ERROR,
                            fix_hint="Add ` *` to the correct option, e.g. `B) Paris *`.",
                        ))
                    elif correct_count > 1:
                        errors.append(ParseError(
                            line=q.source_line,
                            message=f"MCQ question has {correct_count} correct answers — only 1 is allowed.",
                            severity=ParseErrorSeverity.ERROR,
                            fix_hint="Use TYPE: MCQ_MULTI if multiple answers are correct.",
                        ))

                elif q.question_type == ParsedQuestionType.MCQ_MULTI:
                    if correct_count == 0:
                        errors.append(ParseError(
                            line=q.source_line,
                            message="MCQ_MULTI question has no correct answers marked.",
                            severity=ParseErrorSeverity.ERROR,
                            fix_hint="Mark at least one option with ` *`.",
                        ))

        if q.question_type == ParsedQuestionType.ESSAY:
            if q.model_answer is not None and not q.model_answer.strip():
                errors.append(ParseError(
                    line=q.source_line,
                    message="Model answer block is empty.",
                    severity=ParseErrorSeverity.WARNING,
                    fix_hint="Add expected answer content between MODEL_ANSWER: and END_MODEL_ANSWER.",
                ))

        return errors
