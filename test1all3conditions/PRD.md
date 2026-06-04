# OpenVision — Product Requirements Document

This document describes the OpenVision product as it stands today, for a team
re-implementing it from scratch. It is written in terms of users, pages, flows,
behaviors, and rules. Every atomic requirement carries a stable identifier of the
form REQ-### in order of first appearance.

## Product Summary

OpenVision is a web-based platform for authoring, administering, grading, and
analyzing high-stakes university examinations. It is modeled on the assessment
workflow of a large university and is intended to replace a legacy commercial
exam system while improving on it.

- The platform supports the full assessment lifecycle: an educator builds a bank
  of reusable questions, assembles those questions into reusable exam blueprints,
  schedules an exam window for a group of students, students take the exam in a
  focused online environment, the system auto-grades objective questions and
  routes open questions to human graders, results are published to students, and
  educators analyze the statistical quality of each question and test (REQ-001).
- The product serves two broad audiences: educational staff who create and
  operate exams, and students who take exams and view their results (REQ-002).
- The core value is a single, trustworthy, end-to-end assessment system in which
  no student work is lost, every exam is reproducible and fair, results are
  released under educator control, and question quality can be measured and
  improved over time (REQ-003).
- The product must integrate with the surrounding institutional ecosystem: it can
  receive students arriving from an external learning management system, push
  grades back to that system, exchange rosters and accommodation data with a
  student information system, and import/export questions in a portable
  interchange format (REQ-004).
- The entire interface is available in three visual themes — a default dark
  theme, a warmer low-contrast theme, and a lighter blue theme — and the user's
  choice persists across visits (REQ-005).

## Roles and Permissions

The product recognizes four user roles. A user has exactly one role (REQ-006).
Capabilities below are user-facing; the rules are enforced by the system on every
action regardless of what the interface shows.

### Student

- A student can see the list of exams assigned to them, take an assigned exam,
  resume an in-progress exam, and view their own grades and detailed results once
  an educator publishes them (REQ-007).
- A student cannot author questions, build blueprints, schedule exams, grade, or
  view analytics, and cannot see another student's responses or results (REQ-008).
- A student can change their own theme, accessibility preferences, and password,
  and can deactivate their own account (REQ-009).

### Constructor (question author)

- A constructor can create and edit questions, organize them by topic and course,
  duplicate questions, and submit a question for review (REQ-010).
- A constructor can build, edit, duplicate, and delete exam blueprints, run a
  practice attempt of a blueprint, schedule exam sessions, manage student
  enrollment for a session, grade submissions, and view analytics (REQ-011).
- A constructor cannot approve a question for use — approval is reserved to
  reviewers — and cannot perform administrator-only actions such as publishing
  results, managing accommodations, or registering external platforms (REQ-012).

### Reviewer

- A reviewer can move a question that has been submitted for review into the
  approved state, providing the final publishing check that a constructor cannot
  give their own work (REQ-013).

### Administrator

- An administrator has all constructor capabilities plus the ability to publish
  and unpublish exam results, set and manage per-student examination
  accommodations, and configure the integrations with external systems (REQ-014).
- Account identity fields such as email and institutional ID are administrator-
  managed and are not self-editable by ordinary users (REQ-015).

AMBIGUOUS: the role enumeration is ADMIN, CONSTRUCTOR, REVIEWER, STUDENT
(`backend/app/models/user.py`); the navigation only special-cases student vs.
non-student, and gates accommodations to administrators and integrations to
administrators and constructors (`GlobalHeader.tsx`). The reviewer role is a
distinct approval authority in the item workflow but is otherwise treated like a
staff member; this PRD assumes reviewers share the staff navigation.

## Pages and Screens

### Landing page

- When a visitor is not signed in, the entry page is a marketing screen: it
  presents the product name, an animated headline whose final word rotates
  through a small set of synonyms, and a call to action that leads to sign-in
  (REQ-016).
- When a signed-in user opens the entry page, they instead see a role-appropriate
  starting point rather than the marketing screen (REQ-017).

### Sign-in

- The sign-in screen is a split layout with a branded panel and a credential
  form; the user enters an email and password to authenticate (REQ-018).
- The sign-in screen uses its own scoped accent treatment that overlays whichever
  global theme is active (REQ-019).

### Question library

- Staff see a paginated, sortable table of all questions in the bank. Each row
  shows a preview of the question, its topic, its course, its point value, when
  it was last edited, and when it was first created (REQ-020).
- The table always has an active sort; clicking a column header cycles its sort
  direction, and an arrow marks the active column (REQ-021).
- Staff can filter the library by question type, by point value, by course, and
  by lock status (REQ-022).
- Each row exposes actions to open the question for editing or inspection,
  duplicate the question, and copy the question's identifier (REQ-023).
- A row that is referenced by an in-use exam shows a lock indicator and cannot be
  edited or deleted (REQ-024).
- The library offers an entry point into the bulk text-import flow (REQ-025).

### Question editor

- The question editor presents a rich-text area for the question stem that
  supports formatting, mathematical notation, syntax-highlighted code blocks, and
  embedded images (REQ-026).
- For a multiple-choice or multiple-response question, the editor shows an answer-
  options panel where the author adds options and marks which option(s) are
  correct; for a multiple-response question the author can choose all-or-nothing
  or partial-credit scoring (REQ-027).
- For an open/essay question, the author can record a model answer used later as a
  grading reference (REQ-028).
- The author sets the question's point value, its topic, and its course (REQ-029).
- The editor uses explicit save: a save action commits changes, a revert action
  discards them, a visible indicator shows when there are unsaved changes, and
  the user is warned before navigating away with unsaved changes (REQ-030).
- When a question is locked because it is in active use, the editor renders a
  structurally read-only view with no editable fields and no save controls,
  rather than a disabled form (REQ-031).

### Bulk import

- Staff can paste a specially formatted plain-text exam document into a single
  input, request a preview, and review a structured parse of blocks and questions
  alongside a list of per-line errors and warnings (REQ-032).
- Errors are tied to specific lines and block committing until resolved; clicking
  an error focuses the offending line in the input (REQ-033).
- The author chooses whether the import creates questions only, or questions plus
  a draft blueprint assembled from them (REQ-034).
- An in-app format guide and a downloadable template document the accepted syntax,
  which includes a mandatory title, optional block separators, per-question
  metadata (type, cognitive level, difficulty, points, tags), lettered options
  with a correct-answer marker, and model-answer blocks (REQ-035).
- After a successful commit, the user is returned to the library with a success
  confirmation and, when a blueprint was created, a shortcut to view it (REQ-036).
- An in-progress import draft is preserved if the user navigates away and returns
  (REQ-037).

### Blueprint list

- Staff see exam blueprints as cards. Each card shows the blueprint's name, its
  course, a lifecycle status, and a relative timestamp; scheduled or ongoing
  blueprints also show their next session (REQ-038).
- Blueprint lifecycle status is one of New, Scheduled, Ongoing, or Passed; the
  status reflects whether the blueprint has ever been scheduled, has a future
  session, is currently being taken, or has only past sessions (REQ-039).
- New and Scheduled blueprints are editable; Ongoing and Passed blueprints are
  read-only and can only be inspected, never edited (REQ-040).
- Staff can filter the list by status and by course, and search it by name
  (REQ-041).
- Each card offers actions to open, inspect, practice, duplicate, or delete the
  blueprint, subject to its editability (REQ-042).
- The list offers an entry point into the bulk text-import flow (REQ-043).

### Blueprint editor and inspector

- In the editor, staff define how an exam is assembled: selection rules that draw
  questions from the bank (for example, "select N questions tagged with a given
  topic at a given cognitive level"), fixed inclusions of specific questions, and
  a block/section structure that groups questions into named parts (REQ-044).
- The editor lets staff configure scoring (including pass threshold and any
  penalty for wrong answers) and the exam's duration (REQ-045).
- The editor validates the blueprint before saving: it blocks a blueprint with no
  title, with any section containing zero questions, or with a non-positive
  duration, and surfaces these as inline errors (REQ-046).
- When a blueprint is read-only, staff instead see a clean inspector that renders
  the blueprint and its questions — including full stems, all options, and a muted
  marker on the correct option(s) — as a read-only document with no mutation
  controls (REQ-047).

### Sessions

- Staff schedule and monitor exam sessions here. A scheduling form lets them
  choose a blueprint, set a start date and time and an end, and create the session
  (REQ-048).
- The scheduling form refuses past dates and, for the current day, past times
  (REQ-049).
- Scheduled sessions are grouped into Ongoing, Scheduled, and Completed sections,
  with live countdown timers; a row moves between sections automatically as its
  start and end times pass (REQ-050).
- Staff can cancel a scheduled session after confirming, which prevents students
  from joining it (REQ-051).
- Staff can manage which students are enrolled in a session via a roster panel
  that offers a typeahead over registered students who are not yet enrolled, and a
  confirm-on-remove that hard-removes a student; the roster is frozen once the
  session has started or ended (REQ-052).

### Grading

- Staff land on a list of completed exam runs available to grade (REQ-053).
- Selecting a run opens a grading dashboard for that run, showing every
  submission, grading progress, and counts of graded and published results
  (REQ-054).
- The per-submission grading view shows a student's open-question responses
  alongside the model answer and lets the grader assign points and free-text
  feedback per question; objective questions are already auto-scored (REQ-055).
- The grader can enable a blind mode that hides student identity to reduce bias
  (REQ-056).
- Grading progress is saved as the grader works so it is not lost (REQ-057).
- An administrator can set the run's pass threshold (a whole-percentage cut
  score), publish results to students, and unpublish them; publish and unpublish
  are mutually exclusive and results are never published automatically (REQ-058).
- When publishing, the administrator chooses whether students see only their
  outcome or a detailed per-question breakdown (REQ-059).
- Staff can export a run's results as a file formatted for upload to the student
  information system (REQ-060).

### Analytics

- Staff see exam blueprints grouped by course, each annotated with how many
  sessions have completed and how many student submissions exist; this list can be
  sorted (REQ-061).
- Selecting a blueprint leads to its runs, and selecting a run opens a per-run
  statistics dashboard; a combined view that aggregates all runs is also available
  (REQ-062).
- The test-level dashboard shows a score-distribution histogram with mean, median,
  and standard deviation, an internal-consistency reliability coefficient, the
  standard error of measurement, the pass rate, and a cut-score control that shows
  how the pass rate changes as the threshold moves (REQ-063).
- The dashboard lists flagged items — questions whose statistics suggest they are
  too easy, too hard, or poorly discriminating — and offers a per-section
  breakdown that can filter the view (REQ-064).
- Drilling into an item shows its difficulty (as a percentage of students who
  answered correctly), its discrimination value with a plain-language quality
  label, and, for choice questions, a distractor analysis showing what share of
  students chose each incorrect option (REQ-065).
- Every statistic carries an inline explanation so non-statisticians can read it,
  and staff can export an analytics report as a document for exam-board review
  (REQ-066).

### Student — My Exams

- A student sees the exams assigned to them. Each card distinguishes its state:
  an exam that can be started or resumed, an exam already submitted, or an exam
  whose window has expired (REQ-067).

### Student — My Grades

- A student sees their grades split into pending results (graded but not yet
  released) and published results, and can open a published result for detail
  (REQ-068).

### Student — Result detail

- For a published result, a student sees their outcome and, when the educator
  enabled detail, a per-question breakdown of their answer, the correct answer,
  the points awarded, and any grader feedback (REQ-069).

### Exam-taking

- The exam screen is a focused, full-bleed environment without the normal site
  navigation (REQ-070).
- A visual timeline at the bottom shows every question as a navigable cell whose
  appearance reflects its state — current, answered, unanswered, or flagged — and
  the student can jump to any question (REQ-071).
- Each question renders its rich content (formatted text, math, code, images) and
  the appropriate response control: a single-select control for multiple choice, a
  multi-select control for multiple response, and a text area for open questions
  (REQ-072).
- A student can flag any question for later review and unflag it (REQ-073).
- A persistent indicator confirms when the student's latest answer has been saved
  (REQ-074).
- Before submitting, the student sees a review summary of answered, unanswered,
  and flagged questions and must confirm submission, with a warning about
  unanswered questions (REQ-075).
- The forward/submit control remains reachable on short viewports (REQ-076).
- After submission, the student sees a confirmation that includes the submission
  time and is taken to a context-appropriate destination; a practice attempt shows
  its own completion screen (REQ-077).

### Account

- Any signed-in user has an account page with a read-only profile (email, role,
  institutional ID), an appearance section to choose the theme, an accessibility
  section, a security section, and a danger zone (REQ-078).
- The security section lets the user change their password and sign out of all
  other devices (REQ-079).
- The danger zone lets the user deactivate their own account after re-confirming
  their password; this is reversible by an administrator and is not a hard delete,
  and an administrator cannot self-deactivate (REQ-080).

### Accommodations administration

- An administrator sees a searchable list of students with their per-student
  examination provisions, can edit a student's extra-time multiplier and enlarged-
  display flag, and can import provisions in bulk from a file (REQ-081).
- Changes to accommodations are recorded in an audit trail (REQ-082).

### Integrations

- An administrator can register an external learning platform, supplying its
  identifying details, and manage the signing keys the platform uses to trust
  OpenVision (REQ-083).
- An administrator can map an incoming external course context to an OpenVision
  course and bind an external assignment link to a specific scheduled session or
  blueprint, so that students arriving from the external platform reach the right
  exam (REQ-084).
- An administrator can import a student roster and import accommodation data from
  files, and export grades in the format expected by the student information
  system (REQ-085).
- Staff can export questions and tests to a portable interchange format and import
  questions from that format, previewing an import before committing it (REQ-086).

### External-arrival screens

- A student who clicks an exam link inside the external learning platform is
  brought into OpenVision through a launch-resolution screen that establishes
  their session and forwards them to the correct exam (REQ-087).
- An educator embedding an OpenVision exam from inside the external platform uses
  a picker screen that lets them choose which blueprint or scheduled session to
  attach to the assignment, and returns the selection to the platform (REQ-088).

## User Flows

### Authoring to approval

- A constructor creates a question, edits its stem and options, sets its metadata,
  saves it, and submits it for review; a reviewer later approves it, after which it
  is eligible for use in exams (REQ-089).
- Editing an already-approved question does not overwrite it; instead the system
  creates a new draft version, preserving the prior version's history (REQ-090).
- A question that is no longer wanted is retired rather than destroyed, so its
  historical statistics survive (REQ-091).

### Blueprint to scheduled exam

- A constructor assembles a blueprint from bank questions (or generates a draft
  blueprint via import), saves it, and optionally runs a practice attempt to
  experience it as a student would (REQ-092).
- The constructor schedules the blueprint as a session with a start and end time
  and enrolls students; the blueprint's status becomes Scheduled and enrolled
  students can see the exam in My Exams (REQ-093).
- When the start time arrives the session becomes Ongoing and enrolled students
  can join; when the end time passes it becomes Completed and is closed to new
  joins (REQ-094).

### Taking an exam

- An enrolled student opens an ongoing exam from My Exams, answers questions while
  navigating via the timeline, flags questions for review, and relies on the saved
  indicator to confirm their work is captured (REQ-095).
- If the student's connection drops or the browser closes, re-entering the exam
  restores their previous answers and position so they continue from where they
  left off (REQ-096).
- The student reviews their answered/unanswered/flagged summary, confirms
  submission, and receives a submission confirmation; after submission the
  attempt is locked and cannot be changed (REQ-097).

### Grading to publication

- After a run closes, the system has already auto-scored objective questions; a
  grader marks the open questions with points and feedback (REQ-098).
- An administrator sets the cut score and publishes results; published results
  become visible to students in My Grades, in the outcome-only or detailed form
  the administrator selected (REQ-099).
- Results remain invisible to students until publication, and an administrator can
  withdraw them by unpublishing (REQ-100).

### Analysis

- After a graded run, staff open analytics to read the score distribution and
  reliability for the test, identify statistically weak questions, and drill into
  an individual item to inspect its difficulty, discrimination, and distractors,
  exporting a report when needed (REQ-101).

### External-platform flow

- A student following an assignment link from the external learning platform is
  authenticated and routed straight into the correct OpenVision exam without a
  separate sign-in, and their grade is later pushed back to the external platform's
  gradebook (REQ-102).

## Interactive Behavior

- Forms validate input before they act and surface human-readable reasons when an
  action is refused (for example, a blueprint that cannot satisfy its selection
  rules, or a session that cannot be scheduled in the past) (REQ-103).
- The question editor and other surfaces with unsaved changes track a "dirty"
  state, show it, and prompt for confirmation before discarding it (REQ-104).
- Destructive or consequential actions (deleting a blueprint, canceling a session,
  removing an enrolled student, deactivating an account, publishing or
  unpublishing results) require an explicit confirmation that states the
  consequence before proceeding (REQ-105).
- Tables maintain an explicit active sort and respond to header clicks; filters
  that span navigation are remembered per surface (REQ-106).
- Session rows transition between Ongoing/Scheduled/Completed and update their
  countdowns in real time, driven by the passage of time rather than by manual
  refresh (REQ-107).
- The cut-score control in grading and analytics updates the resulting pass rate
  continuously as it is dragged (REQ-108).
- The exam screen continuously persists answer changes and flag toggles shortly
  after the student makes them, and reflects success with the saved indicator
  (REQ-109).
- The bulk-import preview re-parses on demand and reports errors and warnings
  per line, jumping to a line when its error is clicked (REQ-110).
- The theme choice applies immediately and consistently across every page and
  shared chrome, with no page exempt and no visual branching in behavior (REQ-111).
- Navigation between editing surfaces remembers the last item the user was working
  on, so returning to the library or blueprint list restores their context
  (REQ-112).

## Content and Data

- Questions, blueprints, scheduled sessions, enrollments, accommodation
  provisions, and integration mappings are user-entered by staff or administrators
  (REQ-113).
- Student responses, flags, and submissions are generated by students during an
  exam; grades are a mix of system-generated (objective auto-scoring) and human-
  entered (open-question marks and feedback) data (REQ-114).
- Psychometric statistics (difficulty, discrimination, distractor shares,
  reliability, standard error, distributions) are computed by the system from
  completed runs and are not directly editable (REQ-115).
- A question carries an immutable version lineage: each meaningful edit after
  approval yields a new version, and prior versions are retained so statistics can
  be compared across versions over time (REQ-116).
- When a session is instantiated for a student, the exact set of questions (and
  their options) is frozen for that attempt, so later changes to the bank do not
  alter an exam already in progress or completed (REQ-117).
- Question order and, where configured, answer-option order are randomized per
  student attempt (REQ-118).
- A question is "locked" — uneditable and undeletable — exactly when it is
  referenced by a blueprint that is currently being taken or has been taken;
  duplicating a locked question is always allowed because it only reads the source
  (REQ-119).
- A blueprint is editable only while New or Scheduled; once Ongoing or Passed it
  is read-only (REQ-120).
- Results are owned by the run and the student: a student can see only their own
  results, and only after an administrator publishes them (REQ-121).
- Questions belong to a course and a topic; topic is the user-facing term for the
  question's subject tag, and the same topic maps to a consistent color across the
  library, the question picker, and the blueprint editor (REQ-122).
- Course titles are the primary visible label for a course on ordinary screens;
  course codes appear only where disambiguation is needed (REQ-123).
- Imported and exported question/test content round-trips through a portable
  interchange format without loss of the questions' essential content (REQ-124).
- Static reference content includes the in-app import format guide and the
  downloadable import template (REQ-125).

## Non-Functional Requirements

- Every protected action verifies that the requester is authenticated, that their
  role permits the action, and that they own or may legitimately access the target
  resource; the interface's enabled/disabled states are advisory only and the
  authoritative refusal happens on the server (REQ-126).
- A user's signed-in session survives a full page reload or following a deep link;
  the user is not logged out by refreshing a protected page (REQ-127).
- An in-progress exam's state is durably stored on the server as the student
  works, so that no answered question is lost to a crash, power loss, or
  disconnection, and the student can resume exactly where they stopped (REQ-128).
- The system records the time it received each submission and anchors exam
  lifecycle decisions (whether a session is scheduled, ongoing, or completed) to a
  server clock, correcting for a client whose clock is wrong so a skewed client
  cannot misclassify or extend a session (REQ-129).
- A submitted exam attempt is immutable: no further answer changes are accepted
  after submission (REQ-130).
- Students with an approved extra-time provision automatically receive their
  exam duration multiplied by their personal multiplier (for example, a 1.25×
  provision turns a 60-minute exam into 75 minutes), applied without manual
  per-exam intervention (REQ-131).
- Time-bound sessions terminate when their window expires (REQ-132).
- Changing a password or choosing "sign out everywhere" immediately invalidates
  all of that user's other active sessions while keeping the current one alive
  (REQ-133).
- Deactivating an account immediately ends the user's ability to authenticate
  until an administrator restores it (REQ-134).
- Passwords are never stored or shown in readable form (REQ-135).
- Sensitive and abusable actions (sign-in attempts, registration, session-token
  refresh, and exam answer-saving) are rate-limited so that bursts of requests
  cannot overwhelm the system or be used to guess credentials (REQ-136).
- Every list of records is paginated so the system never returns an unbounded
  result set (REQ-137).
- Consequential administrative and integration actions (accommodation changes,
  external-platform registration and key rotation, roster and grade exchanges)
  are written to an append-only audit trail (REQ-138).
- Exam content arriving from external platforms and import files is validated and
  sanitized before it is trusted, and identities provisioned from an external
  platform are granted the least privilege and never silently elevated (REQ-139).
- Grades pushed to an external platform that fail to deliver are recorded so they
  can be retried (REQ-140).
- The product must render correctly and identically in behavior across all three
  themes with no theme-specific code paths (REQ-141).

## Out of Scope

The following are visible in the existing implementation or its planning record
but must NOT be reproduced as product behavior by the next team.

- A locked-down exam browser, proctoring, browser-key validation, a live
  supervisor monitoring dashboard, and anti-cheating measures (window-switch
  detection, copy/paste blocking, IP whitelisting, fingerprinting) were planned
  but are not implemented; there is no such code today, so they are not part of
  the current product (REQ-142).
- Rich media upload and a reusable media/resource library were planned and have a
  surviving design document, but the feature is backlogged and not built; do not
  implement media upload (REQ-143).
- Institutional single-sign-on via a national identity federation was only
  scaffolded conceptually; the real external integration that exists is the
  learning-platform launch flow. Do not reproduce a separate federation SSO as a
  shipped feature (REQ-144).
- Email-driven flows — result-publication notifications and self-service "forgot
  password" reset — are not part of the product; there is no email transport, and
  a locked-out user is reset by an administrator (REQ-145).
- Hotspot (clickable-image) and ordering/drag-and-drop question types are
  referenced as future possibilities but are not implemented; only multiple
  choice, multiple response, and open/essay questions exist (REQ-146).
- Bulk multi-row actions in the question library (bulk duplicate, delete, retag,
  export) are not part of the product (REQ-147).
- A secondary per-blueprint analytics view and the deprecated per-blueprint
  grading routes have been removed in favor of the session-first/run-first
  structure; do not reintroduce per-blueprint grading or a blueprint-keyed grading
  bucket (REQ-148).
- A separate visual "student mode" treatment (distinct student-only color and
  background) is an unresolved inconsistency, not an intended product
  differentiator; the next team should treat student pages within the same themed
  design language rather than reproducing a forked student aesthetic (REQ-149).
- A full mobile/responsive experience is not yet a product commitment; the current
  product is desktop-first and the next team should not treat today's partial
  small-screen behavior as a specification (REQ-150).

AMBIGUOUS: the original exam-taking plan described queuing unsent answer events
in the browser for offline resilience, but the current architecture persists work
through the server immediately and recovers state on reconnection
(`directives/epoch_roadmap.md` §5.3 vs. the Epoch 13 server-side ingestion
record). This PRD specifies server-side durability and resume (REQ-128) and does
not commit to an offline client-side queue; the next team should confirm whether
offline-while-disconnected answering is a required behavior.

# Quality check

## Implementation leakage

- The PRD body deliberately avoids naming frameworks, libraries, data stores,
  files, modules, components, schemas, tables, or endpoint paths. The only
  proper-noun-like references are in two AMBIGUOUS notes and role names, which
  cite source files for the human reviewer rather than describing the product as
  implemented in a given technology: the role enumeration note cites
  `backend/app/models/user.py` and `GlobalHeader.tsx`, and the offline-queue note
  cites `directives/epoch_roadmap.md` and the Epoch 13 record. These are reviewer
  citations attached to AMBIGUOUS findings, not requirement text; the requirements
  themselves (REQ-006, REQ-128) are technology-neutral. No requirement names a
  language, framework, ORM, runtime, table, column, or component.

## Requirement smells

- Vague quantifiers without thresholds: clean. Quantified commitments are
  expressed concretely (whole-percentage cut score in REQ-058; 1.25× → 75 minutes
  example in REQ-131). REQ-136 and REQ-137 describe rate-limiting and pagination
  qualitatively without inventing numeric thresholds not grounded in the product;
  flagged here for the reviewer in case explicit limits are desired.
- Passive voice with no actor: some requirements use system-as-actor passive
  phrasing where the actor is unambiguously "the system" (e.g., REQ-114 "are
  generated by students" names the actor; REQ-115/REQ-129/REQ-132 attribute action
  to "the system"). REQ-117 ("is frozen") and REQ-130 ("no further answer changes
  are accepted") have an implied system actor; flagged for the reviewer.
- Open-ended lists ending in "etc." / "and so on": clean — none used.
- Requirements without a REQ-### ID: clean — every atomic requirement is tagged.
- REQ-### IDs not in monotonically increasing order: clean — IDs run REQ-001
  through REQ-150 in order of first appearance with no gaps or repeats.
- AMBIGUOUS notes left unresolved (surfaced for the reviewer):
  - Role model / reviewer treatment (under Roles and Permissions): assumes
    reviewers share staff navigation; based on `user.py` and `GlobalHeader.tsx`.
  - Offline answering vs. server-side durability (under Out of Scope): assumes
    server-side durability and resume; based on the roadmap §5.3 vs. the Epoch 13
    ingestion record.
