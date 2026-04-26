import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.models import (
    Course,
    CourseEnrollment,
    ExamSession,
    ExamSessionMode,
    GradingStatus,
    InteractionEvent,
    ItemBank,
    ItemStatus,
    ItemVersion,
    LearningObject,
    QuestionGrade,
    QuestionType,
    ScheduledExamSession,
    SessionStatus,
    SessionResult,
    TestDefinition,
    User,
    UserRole,
)

POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = (
    f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def tiptap_doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


QUESTION_CATALOG = [
    {
        "slug": "math_break_even",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "raw_html": (
                "<p>Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. "
                "Break even quantity?</p>"
            )
        },
        "options": {
            "choices": [
                {"id": "A", "text": "12 rolls", "is_correct": True},
                {"id": "B", "text": "8 rolls", "is_correct": False},
                {"id": "C", "text": "24 rolls", "is_correct": False},
                {"id": "D", "text": "6 rolls", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Mathematics",
            "subject": "Mathematics",
            "focus": "Linear Modeling",
            "difficulty": 2,
            "estimated_time_mins": 2,
            "points": 1,
            "math_pool": True,
        },
    },
    {
        "slug": "math_tangent_slope",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": tiptap_doc(
            "Calculus Check: For f(x) = x^2, what is the slope of the tangent at x = 3?"
        ),
        "options": {
            "choices": [
                {"id": "A", "text": "3", "is_correct": False},
                {"id": "B", "text": "6", "is_correct": True},
                {"id": "C", "text": "9", "is_correct": False},
                {"id": "D", "text": "12", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Mathematics",
            "subject": "Mathematics",
            "focus": "Calculus",
            "difficulty": 3,
            "estimated_time_mins": 2,
            "points": 1,
            "math_pool": True,
        },
    },
    {
        "slug": "math_probability",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": (
                "Probability Sprint: Two fair coins are tossed. "
                "What is the probability of exactly one head?"
            )
        },
        "options": {
            "choices": [
                {"id": "A", "text": "1/4", "is_correct": False},
                {"id": "B", "text": "1/2", "is_correct": True},
                {"id": "C", "text": "3/4", "is_correct": False},
                {"id": "D", "text": "1", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Mathematics",
            "subject": "Mathematics",
            "focus": "Probability",
            "difficulty": 2,
            "estimated_time_mins": 2,
            "points": 1,
            "math_pool": True,
        },
    },
    {
        "slug": "science_enzyme",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": (
                "Biology Snapshot: What usually happens when an enzyme gets hot enough "
                "to lose its shape?"
            )
        },
        "options": {
            "choices": [
                {
                    "id": "A",
                    "text": "Its active site changes and it stops working well",
                    "is_correct": True,
                },
                {"id": "B", "text": "It speeds up forever", "is_correct": False},
                {"id": "C", "text": "It turns into DNA", "is_correct": False},
                {"id": "D", "text": "It becomes more acidic", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Science",
            "subject": "Science",
            "focus": "Biology",
            "difficulty": 2,
            "estimated_time_mins": 2,
            "points": 1,
            "science_pool": True,
        },
    },
    {
        "slug": "science_normal_force",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": (
                "Physics Pulse: An elevator accelerates upward. "
                "How does the normal force compare with the passenger's weight?"
            )
        },
        "options": {
            "choices": [
                {"id": "A", "text": "It is smaller than the weight", "is_correct": False},
                {"id": "B", "text": "It is equal to the weight", "is_correct": False},
                {"id": "C", "text": "It is greater than the weight", "is_correct": True},
                {"id": "D", "text": "It drops to zero", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Science",
            "subject": "Science",
            "focus": "Physics",
            "difficulty": 3,
            "estimated_time_mins": 2,
            "points": 1,
            "science_pool": True,
        },
    },
    {
        "slug": "science_ph",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": "Chemistry Quickfire: Which solution is the most acidic?"
        },
        "options": {
            "choices": [
                {"id": "A", "text": "pH 8", "is_correct": False},
                {"id": "B", "text": "pH 7", "is_correct": False},
                {"id": "C", "text": "pH 2", "is_correct": True},
                {"id": "D", "text": "pH 11", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Science",
            "subject": "Science",
            "focus": "Chemistry",
            "difficulty": 1,
            "estimated_time_mins": 1,
            "points": 1,
            "science_pool": True,
        },
    },
    {
        "slug": "humanities_printing_press",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": (
                "History Lens: Which invention most accelerated the spread of "
                "Reformation ideas in Europe?"
            )
        },
        "options": {
            "choices": [
                {"id": "A", "text": "The printing press", "is_correct": True},
                {"id": "B", "text": "The steam engine", "is_correct": False},
                {"id": "C", "text": "The astrolabe", "is_correct": False},
                {"id": "D", "text": "The telegraph", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Humanities",
            "subject": "Humanities",
            "focus": "History",
            "difficulty": 2,
            "estimated_time_mins": 2,
            "points": 1,
            "humanities_pool": True,
        },
    },
    {
        "slug": "humanities_checks_balances",
        "question_type": QuestionType.MULTIPLE_RESPONSE,
        "content": {
            "text": "Civics Filter: Which actions are examples of checks and balances?"
        },
        "options": {
            "choices": [
                {"id": "A", "text": "A court striking down a law", "is_correct": True},
                {"id": "B", "text": "A legislature overriding a veto", "is_correct": True},
                {"id": "C", "text": "A mayor choosing a school mascot", "is_correct": False},
                {"id": "D", "text": "A weather app sending alerts", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Humanities",
            "subject": "Humanities",
            "focus": "Civics",
            "difficulty": 3,
            "estimated_time_mins": 3,
            "points": 2,
            "humanities_pool": True,
            "multiple_response_pool": True,
        },
    },
    {
        "slug": "humanities_fairness_essay",
        "question_type": QuestionType.ESSAY,
        "content": {
            "text": (
                "Ethics Reflection: A tutoring platform flags students as at risk. "
                "Describe one fairness risk and one safeguard."
            )
        },
        "options": {
            "min_words": 40,
            "max_words": 180,
            "scoring_rubric": (
                "Award credit when the response identifies a plausible fairness risk "
                "and proposes a realistic mitigation."
            ),
        },
        "metadata_tags": {
            "topic": "Humanities",
            "subject": "Humanities",
            "focus": "Ethics",
            "difficulty": 4,
            "estimated_time_mins": 6,
            "points": 6,
            "humanities_pool": True,
            "essay_pool": True,
        },
    },
    {
        "slug": "computing_sql_where",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": "Data Query: What does the SQL WHERE clause do?"
        },
        "options": {
            "choices": [
                {
                    "id": "A",
                    "text": "Filters rows before results are returned",
                    "is_correct": True,
                },
                {"id": "B", "text": "Sorts rows alphabetically", "is_correct": False},
                {"id": "C", "text": "Creates a new table", "is_correct": False},
                {"id": "D", "text": "Counts every row", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Computing",
            "subject": "Computing",
            "focus": "Databases",
            "difficulty": 2,
            "estimated_time_mins": 2,
            "points": 1,
            "computing_pool": True,
        },
    },
    {
        "slug": "computing_bandwidth",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": "Networks Snapshot: Which upgrade most directly increases bandwidth?"
        },
        "options": {
            "choices": [
                {"id": "A", "text": "Adding more fiber capacity", "is_correct": True},
                {"id": "B", "text": "Reducing monitor brightness", "is_correct": False},
                {"id": "C", "text": "Shortening a password", "is_correct": False},
                {"id": "D", "text": "Lowering screen resolution", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Computing",
            "subject": "Computing",
            "focus": "Networking",
            "difficulty": 2,
            "estimated_time_mins": 2,
            "points": 1,
            "computing_pool": True,
        },
    },
    {
        "slug": "computing_rollback",
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": {
            "text": (
                "Release Ops: Which practice most helps a team reverse a bad deployment quickly?"
            )
        },
        "options": {
            "choices": [
                {"id": "A", "text": "Keeping a tested rollback plan", "is_correct": True},
                {"id": "B", "text": "Removing logs in production", "is_correct": False},
                {"id": "C", "text": "Skipping staging", "is_correct": False},
                {"id": "D", "text": "Editing the database by hand", "is_correct": False},
            ]
        },
        "metadata_tags": {
            "topic": "Computing",
            "subject": "Computing",
            "focus": "Deployment",
            "difficulty": 3,
            "estimated_time_mins": 2,
            "points": 1,
            "computing_pool": True,
        },
    },
]


def ensure_user(db, *, email: str, password: str, role: UserRole, provision_time_multiplier: float = 1.0):
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.hashed_password = hash_password(password)
        user.role = role
        user.is_active = True
        user.provision_time_multiplier = provision_time_multiplier
        return user

    user = User(
        email=email,
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
        provision_time_multiplier=provision_time_multiplier,
    )
    db.add(user)
    db.flush()
    return user


def fixed_rule(learning_object_id) -> dict:
    return {"rule_type": "FIXED", "learning_object_id": str(learning_object_id)}


def random_rule(tag: str, count: int = 1) -> dict:
    return {"rule_type": "RANDOM", "tags": [tag], "count": count}


def build_item_snapshot(item_version: ItemVersion) -> dict:
    return {
        "learning_object_id": str(item_version.learning_object_id),
        "item_version_id": str(item_version.id),
        "content": item_version.content,
        "options": item_version.options,
        "question_type": item_version.question_type.value,
        "version_number": item_version.version_number,
    }


def get_option_choices(options: dict | list | None) -> list[dict]:
    if isinstance(options, dict) and isinstance(options.get("choices"), list):
        return [choice for choice in options["choices"] if isinstance(choice, dict)]
    if isinstance(options, list):
        return [choice for choice in options if isinstance(choice, dict)]
    return []


def get_correct_indices(options: dict | list | None) -> list[int]:
    return [
        index
        for index, choice in enumerate(get_option_choices(options))
        if choice.get("is_correct") is True
    ]


def index_for_choice_id(options: dict | list | None, choice_id: str) -> int:
    for index, choice in enumerate(get_option_choices(options)):
        if choice.get("id") == choice_id:
            return index
    raise ValueError(f"Choice id {choice_id} was not found in the seeded options.")


def build_mcq_answer(options: dict | list | None, choice_id: str) -> dict:
    selected_index = index_for_choice_id(options, choice_id)
    return {
        "selected_option_index": selected_index,
        "selected_option_id": choice_id,
    }


def build_multiple_response_answer(options: dict | list | None, choice_ids: list[str]) -> dict:
    selected_indices = sorted(index_for_choice_id(options, choice_id) for choice_id in choice_ids)
    return {
        "selected_option_indices": selected_indices,
        "selected_option_ids": choice_ids,
    }


def format_grade_result(total_points: float, max_points: float) -> tuple[float, str, bool]:
    percentage = round((total_points / max_points) * 100, 2) if max_points > 0 else 0.0
    passed = percentage >= 55.0
    return percentage, ("Pass" if passed else "Fail"), passed


def create_submitted_attempt(
    db,
    *,
    blueprint: TestDefinition,
    student: User,
    grader: User,
    publisher: User,
    item_versions: dict[str, ItemVersion],
    item_slugs: list[str],
    answers: dict[str, str | list[str] | dict],
    started_at: datetime,
    submitted_at: datetime,
    published: bool,
) -> ExamSession:
    snapshots = [build_item_snapshot(item_versions[slug]) for slug in item_slugs]

    exam_session = ExamSession(
        test_definition_id=blueprint.id,
        student_id=student.id,
        scheduled_session_id=None,
        items=snapshots,
        status=SessionStatus.SUBMITTED,
        session_mode=ExamSessionMode.ASSIGNED,
        started_at=started_at,
        submitted_at=submitted_at,
        expires_at=submitted_at + timedelta(minutes=2),
    )
    db.add(exam_session)
    db.flush()

    grade_rows: list[QuestionGrade] = []
    total_points = 0.0
    max_points = 0.0
    has_manual_grade = False

    for position, (slug, snapshot, item_version) in enumerate(
        zip(item_slugs, snapshots, (item_versions[slug] for slug in item_slugs), strict=True)
    ):
        row_created_at = submitted_at + timedelta(seconds=position)
        question_type = snapshot["question_type"]
        options = snapshot["options"]
        answer_spec = answers[slug]

        if question_type == QuestionType.MULTIPLE_CHOICE.value:
            student_answer = build_mcq_answer(options, answer_spec)
            correct_indices = get_correct_indices(options)
            is_correct = student_answer["selected_option_index"] in correct_indices
            points_awarded = 1.0 if is_correct else 0.0
            points_possible = 1.0
            grade_rows.append(
                QuestionGrade(
                    session_id=exam_session.id,
                    learning_object_id=item_version.learning_object_id,
                    item_version_id=item_version.id,
                    points_awarded=points_awarded,
                    points_possible=points_possible,
                    is_correct=is_correct,
                    is_auto_graded=True,
                    student_answer=student_answer,
                    correct_answer={"correct_indices": correct_indices},
                    created_at=row_created_at,
                )
            )

        elif question_type == QuestionType.MULTIPLE_RESPONSE.value:
            selected_ids = answer_spec
            student_answer = build_multiple_response_answer(options, selected_ids)
            correct_indices = get_correct_indices(options)
            selected_indices = set(student_answer["selected_option_indices"])
            is_correct = selected_indices == set(correct_indices)
            points_awarded = 1.0 if is_correct else 0.0
            points_possible = 1.0
            grade_rows.append(
                QuestionGrade(
                    session_id=exam_session.id,
                    learning_object_id=item_version.learning_object_id,
                    item_version_id=item_version.id,
                    points_awarded=points_awarded,
                    points_possible=points_possible,
                    is_correct=is_correct,
                    is_auto_graded=True,
                    student_answer=student_answer,
                    correct_answer={"correct_indices": correct_indices},
                    created_at=row_created_at,
                )
            )

        else:
            has_manual_grade = True
            essay_answer = answer_spec
            points_possible = float((item_version.metadata_tags or {}).get("points", 6))
            points_awarded = float(essay_answer["points_awarded"])
            grade_rows.append(
                QuestionGrade(
                    session_id=exam_session.id,
                    learning_object_id=item_version.learning_object_id,
                    item_version_id=item_version.id,
                    points_awarded=points_awarded,
                    points_possible=points_possible,
                    is_correct=points_awarded >= points_possible,
                    graded_by=grader.id,
                    is_auto_graded=False,
                    feedback=essay_answer["feedback"],
                    student_answer={"text": essay_answer["text"]},
                    correct_answer=None,
                    created_at=row_created_at,
                    updated_at=row_created_at,
                )
            )

        total_points += grade_rows[-1].points_awarded
        max_points += grade_rows[-1].points_possible

    db.add_all(grade_rows)

    percentage, letter_grade, passed = format_grade_result(total_points, max_points)
    published_at = submitted_at + timedelta(hours=2) if published else None
    grading_status = GradingStatus.FULLY_GRADED if has_manual_grade else GradingStatus.AUTO_GRADED

    db.add(
        SessionResult(
            session_id=exam_session.id,
            test_definition_id=blueprint.id,
            student_id=student.id,
            total_points=round(total_points, 2),
            max_points=round(max_points, 2),
            percentage=percentage,
            grading_status=grading_status,
            questions_graded=len(grade_rows),
            questions_total=len(grade_rows),
            letter_grade=letter_grade,
            passed=passed,
            is_published=published,
            published_at=published_at,
            published_by=publisher.id if published else None,
            created_at=submitted_at,
            updated_at=published_at if published else submitted_at,
        )
    )

    return exam_session


def seed():
    db = SessionLocal()

    try:
        print("Starting E2E seed (selective wipe)...")

        db.query(InteractionEvent).delete()
        db.query(QuestionGrade).delete()
        db.query(SessionResult).delete()
        db.query(ExamSession).delete()
        db.query(ScheduledExamSession).delete()
        db.query(CourseEnrollment).delete()
        db.query(ItemVersion).delete()
        db.query(TestDefinition).delete()
        db.query(Course).delete()
        db.query(LearningObject).delete()
        db.query(ItemBank).delete()
        db.commit()

        admin = ensure_user(
            db,
            email="admin_e2e@vu.nl",
            password="adminpass123",
            role=UserRole.ADMIN,
        )
        constructor = ensure_user(
            db,
            email="constructor_e2e@vu.nl",
            password="conpass123",
            role=UserRole.CONSTRUCTOR,
        )
        student = ensure_user(
            db,
            email="student_e2e@vu.nl",
            password="studentpass123",
            role=UserRole.STUDENT,
            provision_time_multiplier=1.25,
        )
        alex = ensure_user(
            db,
            email="alex.student@vu.nl",
            password="studentpass123",
            role=UserRole.STUDENT,
        )
        maya = ensure_user(
            db,
            email="maya.student@vu.nl",
            password="studentpass123",
            role=UserRole.STUDENT,
        )
        noor = ensure_user(
            db,
            email="noor.student@vu.nl",
            password="studentpass123",
            role=UserRole.STUDENT,
        )
        liam = ensure_user(
            db,
            email="liam.student@vu.nl",
            password="studentpass123",
            role=UserRole.STUDENT,
        )
        db.commit()

        bank = ItemBank(name="OpenVision Demo Bank", created_by=constructor.id)
        db.add(bank)
        db.flush()

        learning_objects = {}
        item_versions = {}
        for item in QUESTION_CATALOG:
            learning_object = LearningObject(bank_id=bank.id, created_by=constructor.id)
            db.add(learning_object)
            db.flush()

            item_version = ItemVersion(
                learning_object_id=learning_object.id,
                version_number=1,
                status=ItemStatus.APPROVED,
                question_type=item["question_type"],
                content=item["content"],
                options=item["options"],
                metadata_tags=item["metadata_tags"],
                created_by=constructor.id,
            )
            db.add(item_version)
            learning_objects[item["slug"]] = learning_object
            item_versions[item["slug"]] = item_version

        db.flush()

        mixed_essay_lo = learning_objects["humanities_fairness_essay"]

        blueprint_specs = [
            {
                "title": "Shuffle Lab: Numbers in Motion",
                "description": "Fast math practice with shuffled answer order for objective grading checks.",
                "blocks": [
                    {
                        "title": "Quantitative Core",
                        "rules": [
                            fixed_rule(learning_objects["math_break_even"].id),
                            fixed_rule(learning_objects["math_tangent_slope"].id),
                            fixed_rule(learning_objects["math_probability"].id),
                        ],
                    }
                ],
                "duration_minutes": 6,
                "shuffle_questions": False,
                "scoring_config": {"shuffle_options": True},
            },
            {
                "title": "Science Check: Forces and Reactions",
                "description": "Three science quickfire questions for clean objective auto grading.",
                "blocks": [
                    {
                        "title": "Science Sprint",
                        "rules": [
                            fixed_rule(learning_objects["science_enzyme"].id),
                            fixed_rule(learning_objects["science_normal_force"].id),
                            fixed_rule(learning_objects["science_ph"].id),
                        ],
                    }
                ],
                "duration_minutes": 6,
                "shuffle_questions": False,
                "scoring_config": {"shuffle_options": False},
            },
            {
                "title": "Mixed Mode: Policy, Data and Writing",
                "description": "A mixed format demo with multiple response, essay grading, and a computing item.",
                "blocks": [
                    {
                        "title": "Mixed Assessment",
                        "rules": [
                            fixed_rule(learning_objects["humanities_checks_balances"].id),
                            fixed_rule(learning_objects["computing_sql_where"].id),
                            fixed_rule(mixed_essay_lo.id),
                        ],
                    }
                ],
                "duration_minutes": 8,
                "shuffle_questions": False,
                "scoring_config": {
                    "shuffle_options": False,
                    "multiple_response_strategy": "ALL_OR_NOTHING",
                    "essay_points": {str(mixed_essay_lo.id): 6},
                },
            },
            {
                "title": "Smart Draw: Cross Subject Sampler",
                "description": "Randomly draws one item from each subject pool for coverage testing.",
                "blocks": [
                    {"title": "Math Draw", "rules": [random_rule("math_pool")]},
                    {"title": "Science Draw", "rules": [random_rule("science_pool")]},
                    {"title": "Humanities Draw", "rules": [random_rule("humanities_pool")]},
                    {"title": "Computing Draw", "rules": [random_rule("computing_pool")]},
                ],
                "duration_minutes": 8,
                "shuffle_questions": False,
                "scoring_config": {"shuffle_options": True},
            },
        ]

        blueprints = {}
        for spec in blueprint_specs:
            blueprint = TestDefinition(
                title=spec["title"],
                description=spec["description"],
                created_by=constructor.id,
                blocks=spec["blocks"],
                duration_minutes=spec["duration_minutes"],
                shuffle_questions=spec["shuffle_questions"],
                scoring_config=spec["scoring_config"],
            )
            db.add(blueprint)
            db.flush()
            blueprints[spec["title"]] = blueprint

        course_specs = [
            ("MATH-140", "Quantitative Reasoning Studio"),
            ("SCI-115", "Scientific Thinking Lab"),
            ("POL-230", "Digital Policy Workshop"),
            ("XLAB-200", "Cross Subject Challenge Lab"),
        ]

        courses = {}
        enrolled_students = [student, alex, maya, noor, liam]
        for code, title in course_specs:
            course = Course(
                code=code,
                title=title,
                created_by=constructor.id,
                is_active=True,
            )
            db.add(course)
            db.flush()
            courses[code] = course
            for enrolled_student in enrolled_students:
                db.add(
                    CourseEnrollment(
                        course_id=course.id,
                        student_id=enrolled_student.id,
                        is_active=True,
                    )
                )

        now = datetime.now(timezone.utc)
        session_specs = [
            ("MATH-140", "Shuffle Lab: Numbers in Motion", -45),
            ("POL-230", "Mixed Mode: Policy, Data and Writing", -15),
            ("SCI-115", "Science Check: Forces and Reactions", 60),
            ("XLAB-200", "Smart Draw: Cross Subject Sampler", 120),
        ]

        for course_code, blueprint_title, start_offset_seconds in session_specs:
            starts_at = now + timedelta(seconds=start_offset_seconds)
            ends_at = starts_at + timedelta(minutes=2)
            db.add(
                ScheduledExamSession(
                    course_id=courses[course_code].id,
                    test_definition_id=blueprints[blueprint_title].id,
                    created_by=constructor.id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    duration_minutes_override=2,
                )
            )

        create_submitted_attempt(
            db,
            blueprint=blueprints["Shuffle Lab: Numbers in Motion"],
            student=alex,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=["math_break_even", "math_tangent_slope", "math_probability"],
            answers={
                "math_break_even": "A",
                "math_tangent_slope": "B",
                "math_probability": "B",
            },
            started_at=now - timedelta(days=2, minutes=18),
            submitted_at=now - timedelta(days=2, minutes=16),
            published=True,
        )
        create_submitted_attempt(
            db,
            blueprint=blueprints["Shuffle Lab: Numbers in Motion"],
            student=maya,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=["math_break_even", "math_tangent_slope", "math_probability"],
            answers={
                "math_break_even": "B",
                "math_tangent_slope": "B",
                "math_probability": "A",
            },
            started_at=now - timedelta(days=2, minutes=14),
            submitted_at=now - timedelta(days=2, minutes=12),
            published=True,
        )
        create_submitted_attempt(
            db,
            blueprint=blueprints["Shuffle Lab: Numbers in Motion"],
            student=noor,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=["math_break_even", "math_tangent_slope", "math_probability"],
            answers={
                "math_break_even": "A",
                "math_tangent_slope": "C",
                "math_probability": "B",
            },
            started_at=now - timedelta(days=2, minutes=10),
            submitted_at=now - timedelta(days=2, minutes=8),
            published=True,
        )
        create_submitted_attempt(
            db,
            blueprint=blueprints["Science Check: Forces and Reactions"],
            student=liam,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=["science_enzyme", "science_normal_force", "science_ph"],
            answers={
                "science_enzyme": "A",
                "science_normal_force": "C",
                "science_ph": "B",
            },
            started_at=now - timedelta(days=1, hours=6, minutes=12),
            submitted_at=now - timedelta(days=1, hours=6, minutes=10),
            published=True,
        )
        create_submitted_attempt(
            db,
            blueprint=blueprints["Mixed Mode: Policy, Data and Writing"],
            student=maya,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=["humanities_checks_balances", "computing_sql_where", "humanities_fairness_essay"],
            answers={
                "humanities_checks_balances": ["A", "B"],
                "computing_sql_where": "A",
                "humanities_fairness_essay": {
                    "text": (
                        "A tutoring model could over-flag multilingual students if the training data "
                        "mistakes language confidence for weak understanding. A safeguard is to audit "
                        "flags by subgroup and require a human review before action is taken."
                    ),
                    "points_awarded": 5.0,
                    "feedback": "Strong fairness risk and a realistic mitigation plan.",
                },
            },
            started_at=now - timedelta(days=1, hours=3, minutes=12),
            submitted_at=now - timedelta(days=1, hours=3, minutes=9),
            published=True,
        )
        create_submitted_attempt(
            db,
            blueprint=blueprints["Smart Draw: Cross Subject Sampler"],
            student=alex,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=["math_probability", "science_enzyme", "humanities_printing_press", "computing_bandwidth"],
            answers={
                "math_probability": "B",
                "science_enzyme": "A",
                "humanities_printing_press": "B",
                "computing_bandwidth": "A",
            },
            started_at=now - timedelta(hours=20, minutes=18),
            submitted_at=now - timedelta(hours=20, minutes=16),
            published=True,
        )

        db.commit()

        print("Seeded 12 curated questions across Mathematics, Science, Humanities, and Computing.")
        print("Created 4 blueprints and 4 short scheduled sessions for rapid manual testing.")
        print("Inserted completed grading data with published results for seeded demo students.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
