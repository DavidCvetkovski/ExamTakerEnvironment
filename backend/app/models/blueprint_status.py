import enum


class BlueprintStatus(str, enum.Enum):
    """Lifecycle state of a blueprint relative to its scheduled sessions.

    Priority for single-label display (highest first): ONGOING > PASSED > SCHEDULED > NEW.

    Mutability:
      - NEW, SCHEDULED → editable, all actions allowed.
      - ONGOING → locked (mid-session edits would invalidate active attempts).
      - PASSED → permanently locked (preserves grading integrity).
    """

    NEW = "NEW"
    SCHEDULED = "SCHEDULED"
    ONGOING = "ONGOING"
    PASSED = "PASSED"
