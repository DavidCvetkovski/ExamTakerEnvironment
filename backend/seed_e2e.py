import hashlib
import os
from datetime import datetime, timedelta, timezone
from random import Random

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from seed_data.curriculum import COURSE_SPECS, COURSE_TOPICS, POOL_COURSE_MAP
from app.models import (
    Course,
    CourseEnrollment,
    CourseSessionStatus,
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


# ─────────────────────────────────────────────
# Rich TipTap helpers — used by the "code workshop" blueprints below to
# author long prompts with bold / italic / inline-code / code-block content.
# ─────────────────────────────────────────────

def tt_text(text: str, *marks: str) -> dict:
    """Inline text node, optionally with mark types (e.g. 'bold', 'italic', 'code')."""
    node: dict = {"type": "text", "text": text}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node


def tt_paragraph(*inlines: dict) -> dict:
    return {"type": "paragraph", "content": list(inlines)}


def tt_code_block(code: str, language: str = "python") -> dict:
    return {
        "type": "codeBlock",
        "attrs": {"language": language},
        "content": [{"type": "text", "text": code}],
    }


def tt_rich_doc(*nodes: dict) -> dict:
    """Compose a TipTap doc from a mix of paragraph and codeBlock nodes."""
    return {"type": "doc", "content": list(nodes)}


def slugify(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in value).strip("_")


def course_for_pool(pool: str) -> str:
    return POOL_COURSE_MAP.get(pool, "CS-101")


# ─────────────────────────────────────────────────────────────────────────────
# Computer Science item bank — 50 items spanning eight CS topic pools.
# Used by both the curated demo blueprints and the analytics bulk-wave generator.
# Designed so the analytics dashboard surfaces realistic P/D distributions with
# a handful of intentionally easy / hard / weakly-discriminating items.
# ─────────────────────────────────────────────────────────────────────────────

def _mcq(slug, focus, prompt, choices, *, difficulty, points=1, time_mins=2, pool, extra_pool=None, tiptap=False, course_code=None):
    """Shorthand factory for an MCQ item. Keeps the catalog compact."""
    content = tiptap_doc(prompt) if tiptap else {"text": prompt}
    pools = {pool: True}
    if extra_pool:
        pools[extra_pool] = True
    resolved_course = course_code or course_for_pool(pool)
    return {
        "slug": slug,
        "course_code": resolved_course,
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": content,
        "options": {"choices": [
            {"id": cid, "text": text, "is_correct": correct}
            for cid, text, correct in choices
        ]},
        "metadata_tags": {
            "topic": focus,
            "focus": focus,
            "difficulty": difficulty,
            "estimated_time_mins": time_mins,
            "points": points,
            **pools,
        },
    }


def _mr(slug, focus, prompt, choices, *, difficulty, points=2, time_mins=3, pool, course_code=None):
    """Shorthand factory for a MULTIPLE_RESPONSE item."""
    resolved_course = course_code or course_for_pool(pool)
    return {
        "slug": slug,
        "course_code": resolved_course,
        "question_type": QuestionType.MULTIPLE_RESPONSE,
        "content": {"text": prompt},
        "options": {"choices": [
            {"id": cid, "text": text, "is_correct": correct}
            for cid, text, correct in choices
        ]},
        "metadata_tags": {
            "topic": focus,
            "focus": focus,
            "difficulty": difficulty,
            "estimated_time_mins": time_mins,
            "points": points,
            pool: True,
            "multiple_response_pool": True,
        },
    }


def _essay(slug, focus, prompt, *, difficulty, points, time_mins, pool, min_words=80, max_words=300, rubric="", course_code=None):
    """Shorthand factory for an ESSAY item."""
    resolved_course = course_code or course_for_pool(pool)
    return {
        "slug": slug,
        "course_code": resolved_course,
        "question_type": QuestionType.ESSAY,
        "content": {"text": prompt},
        "options": {
            "min_words": min_words,
            "max_words": max_words,
            "scoring_rubric": rubric,
        },
        "metadata_tags": {
            "topic": focus,
            "focus": focus,
            "difficulty": difficulty,
            "estimated_time_mins": time_mins,
            "points": points,
            pool: True,
            "essay_pool": True,
        },
    }


QUESTION_CATALOG = [
    # ── Algorithms (algorithms_pool) ─────────────────────────────────────────
    _mcq("algo_linear_search_bigo", "Algorithms — Complexity",
         "What is the worst-case time complexity of linear search over an unsorted array of length n?",
         [("A", "O(1)", False), ("B", "O(log n)", False),
          ("C", "O(n)", True), ("D", "O(n log n)", False)],
         difficulty=1, pool="algorithms_pool"),
    _mcq("algo_binary_search_pre", "Algorithms — Search",
         "Binary search assumes which property of the input collection?",
         [("A", "It is hashed", False), ("B", "It is sorted", True),
          ("C", "It is doubly linked", False), ("D", "It has unique keys", False)],
         difficulty=2, pool="algorithms_pool"),
    _mcq("algo_merge_sort_bigo", "Algorithms — Sorting",
         "What is the worst-case time complexity of merge sort?",
         [("A", "O(n)", False), ("B", "O(n log n)", True),
          ("C", "O(n²)", False), ("D", "O(log n)", False)],
         difficulty=2, pool="algorithms_pool"),
    _mcq("algo_quicksort_worst", "Algorithms — Sorting",
         "When does quicksort degrade to O(n²) time?",
         [("A", "Always, by definition", False),
          ("B", "When the pivot is consistently the smallest or largest element", True),
          ("C", "When the array fits in cache", False),
          ("D", "When recursion is replaced by iteration", False)],
         difficulty=3, pool="algorithms_pool"),
    _mcq("algo_dp_memoization", "Algorithms — Dynamic Programming",
         "Memoization improves a recursive algorithm primarily by:",
         [("A", "Caching results of overlapping subproblems", True),
          ("B", "Replacing recursion with bit manipulation", False),
          ("C", "Switching to a divide-and-conquer pivot strategy", False),
          ("D", "Compressing the call stack via tail calls", False)],
         difficulty=4, pool="algorithms_pool"),
    _mcq("algo_dijkstra_purpose", "Algorithms — Graphs",
         "Dijkstra's algorithm finds:",
         [("A", "All-pairs shortest paths in a dense graph", False),
          ("B", "Single-source shortest paths with non-negative edge weights", True),
          ("C", "A minimum spanning tree", False),
          ("D", "A topological order of a DAG", False)],
         difficulty=3, pool="algorithms_pool"),
    _mr("algo_traversal_types", "Algorithms — Trees",
        "Which of the following are valid binary-tree traversal orders?",
        [("A", "Pre-order", True), ("B", "In-order", True),
         ("C", "Post-order", True), ("D", "Sigma-order", False)],
        difficulty=2, pool="algorithms_pool"),
    _essay("algo_complexity_essay", "Algorithms — Complexity",
           "Briefly explain why an O(n²) algorithm becomes impractical for n=10⁶ even on modern hardware. Reference a concrete data point (operations per second, memory bandwidth, etc.) to justify the conclusion.",
           difficulty=4, points=6, time_mins=8, pool="algorithms_pool", min_words=80, max_words=250,
           rubric="Full credit when the response (a) computes ~10¹² operations, (b) compares against ~10⁹ ops/sec, and (c) concludes the runtime is roughly 1000 seconds or impractical. Partial credit for any plausible quantitative argument."),

    # ── Data Structures (datastructures_pool) ────────────────────────────────
    _mcq("ds_stack_lifo", "Data Structures — Stack",
         "A stack follows which access discipline?",
         [("A", "First-In-First-Out (FIFO)", False),
          ("B", "Last-In-First-Out (LIFO)", True),
          ("C", "Random access by index", False),
          ("D", "Priority-ordered", False)],
         difficulty=1, pool="datastructures_pool"),
    _mcq("ds_hashmap_collision", "Data Structures — Hash Map",
         "When two distinct keys hash to the same bucket in a hash map, the structure is said to have:",
         [("A", "An overflow exception", False),
          ("B", "A collision", True),
          ("C", "A heap violation", False),
          ("D", "A rebalance event", False)],
         difficulty=2, pool="datastructures_pool"),
    _mcq("ds_linked_list_index", "Data Structures — Linked List",
         "Accessing the k-th element of a singly linked list of length n takes, in the worst case:",
         [("A", "O(1) time", False), ("B", "O(log n) time", False),
          ("C", "O(k) time", True), ("D", "O(n²) time", False)],
         difficulty=2, pool="datastructures_pool"),
    _mcq("ds_bst_search", "Data Structures — Trees",
         "Searching in a balanced binary search tree of n keys takes, in the worst case:",
         [("A", "O(1)", False), ("B", "O(log n)", True),
          ("C", "O(n)", False), ("D", "O(n log n)", False)],
         difficulty=2, pool="datastructures_pool"),
    _mcq("ds_heap_property", "Data Structures — Heap",
         "The defining invariant of a binary max-heap is that:",
         [("A", "Every node is greater than or equal to its children", True),
          ("B", "The tree is sorted in-order", False),
          ("C", "Every node has exactly two children", False),
          ("D", "The leaves are coloured red and black alternately", False)],
         difficulty=3, pool="datastructures_pool"),
    _mr("ds_graph_representation", "Data Structures — Graphs",
        "Which of the following are standard ways to represent a graph in memory?",
        [("A", "Adjacency list", True), ("B", "Adjacency matrix", True),
         ("C", "Edge list", True), ("D", "Bloom filter", False)],
        difficulty=3, pool="datastructures_pool"),
    _mcq("ds_trie_use_case", "Data Structures — Trie",
         "A trie is most appropriate when you need to:",
         [("A", "Sort numeric values in O(log n)", False),
          ("B", "Look up prefixes of strings efficiently", True),
          ("C", "Implement a fixed-size LRU cache", False),
          ("D", "Detect cycles in an undirected graph", False)],
         difficulty=4, pool="datastructures_pool"),
    _mcq("ds_amortized_arraylist", "Data Structures — Dynamic Arrays",
         "An ArrayList (Vector) that doubles its capacity on overflow has what amortized cost per append?",
         [("A", "O(1)", True), ("B", "O(log n)", False),
          ("C", "O(n)", False), ("D", "O(n²)", False)],
         difficulty=3, pool="datastructures_pool"),

    # ── Operating Systems (os_pool) ──────────────────────────────────────────
    _mcq("os_process_vs_thread", "Operating Systems — Concurrency",
         "Compared to processes, threads within the same process:",
         [("A", "Share the same address space", True),
          ("B", "Have isolated page tables", False),
          ("C", "Cannot share file descriptors", False),
          ("D", "Always run on separate CPU cores", False)],
         difficulty=2, pool="os_pool"),
    _mcq("os_context_switch_cost", "Operating Systems — Scheduling",
         "The primary cost of a context switch comes from:",
         [("A", "Re-encrypting kernel memory", False),
          ("B", "Saving / restoring register state and refilling caches/TLB", True),
          ("C", "Re-allocating the heap", False),
          ("D", "Restarting the boot loader", False)],
         difficulty=3, pool="os_pool"),
    _mr("os_scheduling_algos", "Operating Systems — Scheduling",
        "Which of the following are real CPU scheduling algorithms?",
        [("A", "Round Robin", True), ("B", "Shortest Job First", True),
         ("C", "Multilevel Feedback Queue", True),
         ("D", "Eager Page Eviction", False)],
        difficulty=3, pool="os_pool"),
    _mr("os_deadlock_conditions", "Operating Systems — Concurrency",
        "Which conditions must hold simultaneously for a deadlock to occur (Coffman conditions)?",
        [("A", "Mutual exclusion", True), ("B", "Hold and wait", True),
         ("C", "No preemption", True), ("D", "Circular wait", True)],
        difficulty=4, pool="os_pool"),
    _mcq("os_virtual_memory_purpose", "Operating Systems — Memory",
         "Virtual memory is primarily used to:",
         [("A", "Defragment SSDs without rewriting blocks", False),
          ("B", "Give each process a private, contiguous-looking address space", True),
          ("C", "Eliminate the need for a CPU cache", False),
          ("D", "Replace the file system on small devices", False)],
         difficulty=3, pool="os_pool"),
    _mcq("os_mutex_vs_semaphore", "Operating Systems — Concurrency",
         "The most accurate distinction between a mutex and a counting semaphore is that:",
         [("A", "A mutex enforces a single owner; a counting semaphore tracks N permits", True),
          ("B", "A mutex is non-blocking; a semaphore always blocks", False),
          ("C", "A mutex lives in user space; a semaphore must live in the kernel", False),
          ("D", "A mutex is atomic; a semaphore is not", False)],
         difficulty=4, pool="os_pool"),
    _mcq("os_fork_semantics", "Operating Systems — Processes",
         "Immediately after a successful POSIX fork(), the child process:",
         [("A", "Shares the parent's address space (no copy)", False),
          ("B", "Receives a copy-on-write duplicate of the parent's address space", True),
          ("C", "Begins execution from main() with a fresh stack", False),
          ("D", "Inherits no open file descriptors", False)],
         difficulty=3, pool="os_pool"),
    _essay("os_paging_essay", "Operating Systems — Memory",
           "Explain how paging translates a virtual address into a physical address. Mention the role of the page table and the TLB, and state one consequence of a TLB miss.",
           difficulty=4, points=6, time_mins=8, pool="os_pool", min_words=80, max_words=250,
           rubric="Full credit when the response describes (a) splitting the address into page-number + offset, (b) page-table lookup yielding a frame number, (c) TLB as a cache of recent translations, (d) TLB miss forcing a page-table walk."),

    # ── Databases (databases_pool) ───────────────────────────────────────────
    _mcq("db_sql_inner_join", "Databases — SQL",
         "An INNER JOIN between tables A and B returns:",
         [("A", "Every row of A regardless of match", False),
          ("B", "Only the rows where the join predicate matches in both", True),
          ("C", "A cross product unless WHERE filters it", False),
          ("D", "Every row of B plus matching A rows", False)],
         difficulty=2, pool="databases_pool"),
    _mcq("db_primary_vs_foreign_key", "Databases — Schema",
         "Which statement about primary and foreign keys is correct?",
         [("A", "A foreign key must reference a primary key in another table", True),
          ("B", "A table can have multiple primary keys", False),
          ("C", "Foreign keys are stored only on the referenced row", False),
          ("D", "Primary keys may contain NULL values", False)],
         difficulty=2, pool="databases_pool"),
    _mcq("db_normalization_3nf", "Databases — Normalization",
         "Third Normal Form (3NF) eliminates which kind of anomaly?",
         [("A", "Repeating groups within a single column", False),
          ("B", "Partial dependencies on a composite key", False),
          ("C", "Transitive dependencies on non-key attributes", True),
          ("D", "Cyclic foreign-key references", False)],
         difficulty=3, pool="databases_pool"),
    _mcq("db_index_tradeoff", "Databases — Indexes",
         "Adding a non-clustered index on a heavily-written column primarily trades:",
         [("A", "Less storage for slower reads", False),
          ("B", "Faster reads on that column for slower writes and more storage", True),
          ("C", "Faster transactions for weaker isolation", False),
          ("D", "Schema simplicity for replication latency", False)],
         difficulty=3, pool="databases_pool"),
    _mcq("db_acid_atomicity", "Databases — Transactions",
         "Atomicity in ACID guarantees that:",
         [("A", "Concurrent transactions cannot read each other's writes", False),
          ("B", "A transaction either commits entirely or has no effect", True),
          ("C", "Committed data survives a crash", False),
          ("D", "Each transaction sees a consistent schema version", False)],
         difficulty=2, pool="databases_pool"),
    _mcq("db_acid_isolation", "Databases — Transactions",
         "At the READ COMMITTED isolation level, which phenomenon is still possible?",
         [("A", "Dirty reads", False),
          ("B", "Non-repeatable reads", True),
          ("C", "Lost updates on a single column", False),
          ("D", "Reads of data that never existed", False)],
         difficulty=4, pool="databases_pool"),
    _mcq("db_nosql_when", "Databases — NoSQL",
         "A document store (e.g. MongoDB) is typically a better fit than a relational database when:",
         [("A", "The schema rarely changes and joins are frequent", False),
          ("B", "Data is hierarchical, schema-flexible, and read by document ID", True),
          ("C", "Strong cross-row transactions are critical", False),
          ("D", "The workload is dominated by complex multi-table aggregations", False)],
         difficulty=3, pool="databases_pool"),
    _essay("db_transaction_essay", "Databases — Transactions",
           "Explain why the SERIALIZABLE isolation level is rarely the default in production database systems. Mention one anomaly it prevents and one concrete performance cost it imposes.",
           difficulty=4, points=6, time_mins=7, pool="databases_pool", min_words=80, max_words=220,
           rubric="Full credit when the response names a phenomenon prevented (phantom read or write skew) AND a concrete cost (lock contention, reduced concurrency, retry storms under SSI)."),

    # ── Networking (networking_pool) ─────────────────────────────────────────
    _mcq("net_tcp_vs_udp", "Networking — Transport",
         "Which guarantee does TCP provide that UDP does not?",
         [("A", "Multicast delivery to many recipients", False),
          ("B", "Reliable, in-order, byte-stream delivery", True),
          ("C", "Faster handshake with zero RTT", False),
          ("D", "Encryption of payload bytes", False)],
         difficulty=2, pool="networking_pool"),
    _mcq("net_dns_purpose", "Networking — DNS",
         "DNS primarily translates:",
         [("A", "Domain names into IP addresses", True),
          ("B", "IP addresses into MAC addresses", False),
          ("C", "URLs into HTTPS certificates", False),
          ("D", "Hostnames into AS numbers", False)],
         difficulty=1, pool="networking_pool"),
    _mr("net_http_methods", "Networking — HTTP",
        "Which of the following HTTP methods are considered idempotent by the spec?",
        [("A", "GET", True), ("B", "PUT", True),
         ("C", "DELETE", True), ("D", "POST", False)],
        difficulty=3, pool="networking_pool"),
    _mcq("net_osi_layers", "Networking — OSI Model",
         "TCP operates at which OSI layer?",
         [("A", "Layer 2 (Data Link)", False),
          ("B", "Layer 3 (Network)", False),
          ("C", "Layer 4 (Transport)", True),
          ("D", "Layer 7 (Application)", False)],
         difficulty=2, pool="networking_pool"),
    _mcq("net_tls_handshake", "Networking — Security",
         "During a TLS 1.3 handshake, the symmetric session keys are derived using:",
         [("A", "RSA encryption of a pre-master secret with the server's public key", False),
          ("B", "An (EC)DHE key exchange combined with HKDF", True),
          ("C", "A challenge–response over plaintext HTTP", False),
          ("D", "AES-CBC over the certificate fingerprint", False)],
         difficulty=4, pool="networking_pool"),
    _essay("net_routing_essay", "Networking — Routing",
           "Compare distance-vector and link-state routing. Mention one example protocol per family and the principal trade-off (e.g. convergence speed vs. control-plane bandwidth).",
           difficulty=4, points=6, time_mins=8, pool="networking_pool", min_words=80, max_words=220,
           rubric="Full credit when both families are named with an example each (RIP/EIGRP vs OSPF/IS-IS) and the trade-off is stated correctly."),

    # ── Security (security_pool) ─────────────────────────────────────────────
    _mcq("sec_password_hashing", "Security — Authentication",
         "Which is the recommended way to store user passwords?",
         [("A", "Plain text in a protected table", False),
          ("B", "MD5 of the password", False),
          ("C", "A salted, slow KDF such as bcrypt or argon2", True),
          ("D", "AES-encrypted with a key shared across services", False)],
         difficulty=2, pool="security_pool"),
    _mcq("sec_sql_injection", "Security — Web",
         "The most reliable defence against SQL injection is:",
         [("A", "Stripping single quotes from user input", False),
          ("B", "Using parameterised queries / prepared statements", True),
          ("C", "Wrapping the database connection in HTTPS", False),
          ("D", "Restricting input to lowercase characters", False)],
         difficulty=2, pool="security_pool"),
    _mcq("sec_xss_vs_csrf", "Security — Web",
         "Which statement correctly distinguishes XSS from CSRF?",
         [("A", "XSS exfiltrates session cookies via injected script; CSRF tricks a logged-in user's browser into issuing a state-changing request", True),
          ("B", "XSS only affects mobile clients; CSRF only affects desktop", False),
          ("C", "XSS is a transport-layer attack; CSRF is a network-layer attack", False),
          ("D", "XSS is mitigated by HTTPS; CSRF is not", False)],
         difficulty=4, pool="security_pool"),
    _mcq("sec_jwt_purpose", "Security — Authentication",
         "JWTs are typically used to:",
         [("A", "Carry self-contained, signed user identity claims between services", True),
          ("B", "Encrypt the entire HTTP body", False),
          ("C", "Replace TLS for end-to-end transport encryption", False),
          ("D", "Provide a row-level lock in the database", False)],
         difficulty=3, pool="security_pool"),
    _essay("sec_design_essay", "Security — Design",
           "A teammate proposes storing API keys as plain-text values in the React frontend so the backend can be 'just a passthrough'. Explain in two or three points why this is unsafe and what a safer architecture looks like.",
           difficulty=4, points=6, time_mins=8, pool="security_pool", min_words=80, max_words=250,
           rubric="Full credit when the response identifies (a) JS bundle is fully readable by users / attackers, (b) keys leak in the network tab and source maps, and proposes (c) keep secrets server-side, proxy requests through the backend, use short-lived tokens for the browser."),

    # ── ML (ml_pool) ─────────────────────────────────────────────────────────
    _mcq("ml_supervised_vs_unsupervised", "Machine Learning — Paradigms",
         "Which task is unsupervised?",
         [("A", "Spam vs ham email classification", False),
          ("B", "Predicting house prices from features", False),
          ("C", "Grouping customers into clusters with no labels", True),
          ("D", "Tagging part-of-speech in labelled sentences", False)],
         difficulty=2, pool="ml_pool"),
    _mcq("ml_overfitting_sign", "Machine Learning — Generalisation",
         "A model whose training accuracy is 98% but whose validation accuracy is 71% is most likely:",
         [("A", "Underfitting", False),
          ("B", "Overfitting", True),
          ("C", "Properly regularised", False),
          ("D", "Suffering from label leakage", False)],
         difficulty=2, pool="ml_pool"),
    _mcq("ml_gradient_descent", "Machine Learning — Optimisation",
         "If the learning rate of gradient descent is set too high, the most common symptom is:",
         [("A", "Loss decreases monotonically but slowly", False),
          ("B", "Loss oscillates or diverges instead of converging", True),
          ("C", "The model stops training after one epoch", False),
          ("D", "Gradients become exactly zero", False)],
         difficulty=3, pool="ml_pool"),
    _essay("ml_bias_fairness_essay", "Machine Learning — Ethics",
           "Imagine an ML-based hiring screen flags far fewer candidates from a particular university. Describe one mechanism by which the training data could have caused this and one concrete intervention you would propose before deploying the system.",
           difficulty=5, points=6, time_mins=10, pool="ml_pool", min_words=100, max_words=300,
           rubric="Full credit when (a) a plausible data-driven cause is described (historical under-representation, biased labels, proxy features) AND (b) an intervention is concrete (subgroup audit, reweighting, threshold tuning, human-in-the-loop review)."),

    # ── Software Engineering (swe_pool) ──────────────────────────────────────
    _mcq("swe_git_merge_vs_rebase", "Software Engineering — Version Control",
         "Which statement about `git rebase` vs `git merge` is accurate?",
         [("A", "Rebase rewrites the branch's commits onto a new base; merge creates a new merge commit", True),
          ("B", "Merge rewrites history; rebase preserves it", False),
          ("C", "Both produce identical histories", False),
          ("D", "Rebase requires a force-push on a private branch", False)],
         difficulty=3, pool="swe_pool"),
    _mcq("swe_code_review_purpose", "Software Engineering — Practice",
         "The primary purpose of a code review is to:",
         [("A", "Catch defects, share knowledge, and align on style early", True),
          ("B", "Re-run the test suite that CI already ran", False),
          ("C", "Replace pair programming entirely", False),
          ("D", "Generate documentation automatically", False)],
         difficulty=2, pool="swe_pool"),
    _mcq("swe_solid_principle", "Software Engineering — Design",
         "Which scenario most clearly violates the Single Responsibility Principle?",
         [("A", "A `User` class that holds user fields and also writes user rows to the database and sends marketing emails", True),
          ("B", "A function that uses early returns to reduce nesting", False),
          ("C", "An interface declaring only the methods consumers actually call", False),
          ("D", "A class composed of two collaborators via constructor injection", False)],
         difficulty=4, pool="swe_pool"),
]


def build_curriculum_extension() -> list[dict]:
    """Generate course-linked questions across the demo curriculum."""
    generated: list[dict] = []
    for course_code, course_title in COURSE_SPECS:
        course_slug = slugify(course_code)
        course_pool = f"{course_slug}_pool"
        for topic_index, topic in enumerate(COURSE_TOPICS[course_code], start=1):
            topic_slug = slugify(topic)
            topic_pool = f"{course_slug}_{topic_slug}_pool"
            for question_index in range(1, 4):
                generated.append(
                    _mcq(
                        f"{course_slug}_{topic_slug}_mcq_{question_index}",
                        topic,
                        f"In {course_title}, which statement best matches the idea of {topic.lower()}?",
                        [
                            ("A", f"It supports the core reasoning used in {topic.lower()}", True),
                            ("B", "It is only a naming convention with no practical effect", False),
                            ("C", "It is unrelated to how students solve problems in the course", False),
                            ("D", "It always removes the need for evidence or testing", False),
                        ],
                        difficulty=((topic_index + question_index) % 5) + 1,
                        points=1,
                        time_mins=2,
                        pool=course_pool,
                        extra_pool=topic_pool,
                        course_code=course_code,
                    )
                )

            if topic_index <= 2:
                generated.append(
                    _mr(
                        f"{course_slug}_{topic_slug}_multi",
                        topic,
                        f"Which practices are appropriate when applying {topic.lower()} in {course_title}?",
                        [
                            ("A", "Check the assumptions before applying the method", True),
                            ("B", "Use examples to test the reasoning", True),
                            ("C", "Ignore edge cases because they are rare", False),
                            ("D", "Explain the trade-off in plain language", True),
                        ],
                        difficulty=3,
                        points=2,
                        time_mins=3,
                        pool=course_pool,
                        course_code=course_code,
                    )
                )
                generated.append(
                    _essay(
                        f"{course_slug}_{topic_slug}_essay",
                        topic,
                        f"Explain a realistic scenario where {topic.lower()} matters in {course_title}. Include one trade-off and one common mistake.",
                        difficulty=4,
                        points=6,
                        time_mins=8,
                        pool=course_pool,
                        min_words=80,
                        max_words=260,
                        rubric=f"Looks for accurate use of {topic.lower()}, a concrete trade-off, and a plausible mistake.",
                        course_code=course_code,
                    )
                )
    return generated


QUESTION_CATALOG.extend(build_curriculum_extension())


# ─────────────────────────────────────────────────────────────────────────────
# Rich-content workshop items — long prompts with bold / italic / inline-code
# / multi-line code-block content. Two themed blueprints (Python + Web/JS)
# consume these so the editor's rich-text rendering can be visually verified
# end-to-end.
# ─────────────────────────────────────────────────────────────────────────────

def _rich_item(slug: str, focus: str, course_code: str, content: dict, choices: list, *, difficulty: int, points: int = 1, time_mins: int = 3) -> dict:
    """MCQ-style item whose content is an already-built TipTap doc."""
    return {
        "slug": slug,
        "course_code": course_code,
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": content,
        "options": {"choices": [
            {"id": cid, "text": text, "is_correct": correct}
            for cid, text, correct in choices
        ]},
        "metadata_tags": {
            "topic": focus,
            "focus": focus,
            "difficulty": difficulty,
            "estimated_time_mins": time_mins,
            "points": points,
            "rich_pool": True,
        },
    }


def _rich_essay(slug: str, focus: str, course_code: str, content: dict, *, min_words: int, max_words: int, points: int, time_mins: int, rubric: str) -> dict:
    return {
        "slug": slug,
        "course_code": course_code,
        "question_type": QuestionType.ESSAY,
        "content": content,
        "options": {
            "min_words": min_words,
            "max_words": max_words,
            "scoring_rubric": rubric,
        },
        "metadata_tags": {
            "topic": focus,
            "focus": focus,
            "difficulty": 3,
            "estimated_time_mins": time_mins,
            "points": points,
            "rich_pool": True,
            "essay_pool": True,
        },
    }


# ── Python workshop items ────────────────────────────────────────────────────

PY_WORKSHOP_ITEMS = [
    _rich_item(
        "py_workshop_dict_default", "Python — Built-ins", "CS-101",
        tt_rich_doc(
            tt_paragraph(
                tt_text("Consider the following Python function that counts word frequencies in a list of strings. "),
                tt_text("It uses ", "italic"),
                tt_text("dict.get", "code"),
                tt_text(" with a default value to avoid a "),
                tt_text("KeyError", "code"),
                tt_text(":"),
            ),
            tt_code_block(
                "def word_counts(words):\n"
                "    counts = {}\n"
                "    for w in words:\n"
                "        counts[w] = counts.get(w, 0) + 1\n"
                "    return counts\n"
                "\n"
                "print(word_counts(['a', 'b', 'a', 'c', 'b', 'a']))",
                language="python",
            ),
            tt_paragraph(
                tt_text("Which line of output does this script print?", "bold"),
            ),
        ),
        [
            ("A", "{'a': 3, 'b': 2, 'c': 1}", True),
            ("B", "{'a': 1, 'b': 1, 'c': 1}", False),
            ("C", "{'a': 2, 'b': 2, 'c': 2}", False),
            ("D", "Raises KeyError on the first iteration", False),
        ],
        difficulty=1, time_mins=2,
    ),

    _rich_item(
        "py_workshop_list_aliasing", "Python — Mutability", "CS-101",
        tt_rich_doc(
            tt_paragraph(
                tt_text("A common Python footgun is "),
                tt_text("aliasing", "bold"),
                tt_text(": two names referring to the "),
                tt_text("same", "italic"),
                tt_text(" underlying object. Read the snippet below:"),
            ),
            tt_code_block(
                "a = [1, 2, 3]\n"
                "b = a\n"
                "b.append(4)\n"
                "print(a, b)",
                language="python",
            ),
            tt_paragraph(
                tt_text("What is printed?", "bold"),
            ),
        ),
        [
            ("A", "[1, 2, 3] [1, 2, 3, 4]", False),
            ("B", "[1, 2, 3, 4] [1, 2, 3, 4]", True),
            ("C", "[1, 2, 3] [4]", False),
            ("D", "Raises TypeError because lists cannot be reassigned", False),
        ],
        difficulty=2,
    ),

    _rich_item(
        "py_workshop_comprehension", "Python — Comprehensions", "CS-101",
        tt_rich_doc(
            tt_paragraph(
                tt_text("List comprehensions can express map and filter together. The expression below uses "),
                tt_text("both", "italic"),
                tt_text(" a transformation and a guard:"),
            ),
            tt_code_block(
                "nums = [1, 2, 3, 4, 5, 6]\n"
                "result = [x * x for x in nums if x % 2 == 0]\n"
                "print(result)",
                language="python",
            ),
            tt_paragraph(
                tt_text("Which list is printed?", "bold"),
            ),
        ),
        [
            ("A", "[1, 4, 9, 16, 25, 36]", False),
            ("B", "[2, 4, 6]", False),
            ("C", "[4, 16, 36]", True),
            ("D", "[1, 9, 25]", False),
        ],
        difficulty=1,
    ),

    _rich_item(
        "py_workshop_default_arg", "Python — Pitfalls", "CS-101",
        tt_rich_doc(
            tt_paragraph(
                tt_text("Mutable default arguments are a well-known "),
                tt_text("Python pitfall", "bold"),
                tt_text(" because defaults are evaluated "),
                tt_text("once", "italic"),
                tt_text(" at function-definition time:"),
            ),
            tt_code_block(
                "def append_to(value, target=[]):\n"
                "    target.append(value)\n"
                "    return target\n"
                "\n"
                "print(append_to(1))\n"
                "print(append_to(2))\n"
                "print(append_to(3))",
                language="python",
            ),
            tt_paragraph(
                tt_text("What are the three printed lines, in order?", "bold"),
            ),
        ),
        [
            ("A", "[1]\\n[2]\\n[3]", False),
            ("B", "[1]\\n[1, 2]\\n[1, 2, 3]", True),
            ("C", "[1]\\n[1]\\n[1]", False),
            ("D", "Raises a TypeError on the second call", False),
        ],
        difficulty=3, time_mins=4,
    ),

    _rich_item(
        "py_workshop_generator_lazy", "Python — Iterators", "CS-101",
        tt_rich_doc(
            tt_paragraph(
                tt_text("Generators are "),
                tt_text("lazy", "italic"),
                tt_text(": values are produced on demand. Consider:"),
            ),
            tt_code_block(
                "def squares(n):\n"
                "    for i in range(n):\n"
                "        yield i * i\n"
                "\n"
                "g = squares(4)\n"
                "print(next(g))\n"
                "print(next(g))\n"
                "print(list(g))",
                language="python",
            ),
            tt_paragraph(
                tt_text("What are the three printed lines, in order?", "bold"),
            ),
        ),
        [
            ("A", "0\\n1\\n[4, 9]", True),
            ("B", "0\\n1\\n[0, 1, 4, 9]", False),
            ("C", "0\\n1\\n[2, 3]", False),
            ("D", "Raises StopIteration on the last call", False),
        ],
        difficulty=2,
    ),

    _rich_essay(
        "py_workshop_refactor_essay", "Python — Refactoring", "CS-101",
        tt_rich_doc(
            tt_paragraph(
                tt_text("You inherit the following utility. It "),
                tt_text("works", "italic"),
                tt_text(", but a reviewer flagged it as "),
                tt_text("hard to test, hard to extend, and silently wrong on edge cases", "bold"),
                tt_text(":"),
            ),
            tt_code_block(
                "def average(numbers):\n"
                "    total = 0\n"
                "    count = 0\n"
                "    for n in numbers:\n"
                "        total = total + n\n"
                "        count = count + 1\n"
                "    return total / count\n",
                language="python",
            ),
            tt_paragraph(
                tt_text("In 120-250 words: "),
                tt_text("(a)", "bold"),
                tt_text(" name two correctness bugs in this implementation, "),
                tt_text("(b)", "bold"),
                tt_text(" propose a more idiomatic refactor using built-ins, and "),
                tt_text("(c)", "bold"),
                tt_text(" describe how you'd unit-test the refactored version."),
            ),
        ),
        min_words=120, max_words=250, points=6, time_mins=12,
        rubric="2pts per part (a/b/c). Full credit: empty input bug + non-numeric input bug; refactor uses sum()/len() with an empty-input guard; tests cover happy path + empty + mixed types.",
    ),
]


# ── JavaScript / TypeScript workshop items ───────────────────────────────────

JS_WORKSHOP_ITEMS = [
    _rich_item(
        "js_workshop_hoisting", "JavaScript — Scoping", "WEB-240",
        tt_rich_doc(
            tt_paragraph(
                tt_text("JavaScript hoists "),
                tt_text("var", "code"),
                tt_text(" declarations to the top of their scope but "),
                tt_text("not", "italic"),
                tt_text(" the assignments. Predict the output:"),
            ),
            tt_code_block(
                "console.log(x);\n"
                "var x = 5;\n"
                "console.log(x);",
                language="javascript",
            ),
            tt_paragraph(
                tt_text("Which output does this snippet produce?", "bold"),
            ),
        ),
        [
            ("A", "5 then 5", False),
            ("B", "undefined then 5", True),
            ("C", "ReferenceError on the first line", False),
            ("D", "null then 5", False),
        ],
        difficulty=2,
    ),

    _rich_item(
        "js_workshop_const_object", "JavaScript — const semantics", "WEB-240",
        tt_rich_doc(
            tt_paragraph(
                tt_text("A common misconception is that "),
                tt_text("const", "code"),
                tt_text(" makes a value "),
                tt_text("immutable", "italic"),
                tt_text(". It actually only prevents "),
                tt_text("rebinding", "bold"),
                tt_text(" the identifier:"),
            ),
            tt_code_block(
                "const user = { name: 'Aria', role: 'student' };\n"
                "user.role = 'admin';\n"
                "console.log(user.role);\n"
                "user = { name: 'Bram' };  // line 4",
                language="javascript",
            ),
            tt_paragraph(
                tt_text("Which statement best describes the runtime behaviour?", "bold"),
            ),
        ),
        [
            ("A", "Both mutations succeed and the script prints 'admin'.", False),
            ("B", "Line 2 throws because user is const.", False),
            ("C", "Line 2 succeeds and prints 'admin'; line 4 throws a TypeError.", True),
            ("D", "Both line 2 and line 4 throw because user is const.", False),
        ],
        difficulty=2,
    ),

    _rich_item(
        "js_workshop_async_order", "JavaScript — Event Loop", "WEB-240",
        tt_rich_doc(
            tt_paragraph(
                tt_text("The "),
                tt_text("microtask queue", "bold"),
                tt_text(" (promises) drains "),
                tt_text("before", "italic"),
                tt_text(" the macrotask queue ("),
                tt_text("setTimeout", "code"),
                tt_text(") on each tick of the event loop:"),
            ),
            tt_code_block(
                "console.log('A');\n"
                "setTimeout(() => console.log('B'), 0);\n"
                "Promise.resolve().then(() => console.log('C'));\n"
                "console.log('D');",
                language="javascript",
            ),
            tt_paragraph(
                tt_text("In what order are the four letters logged?", "bold"),
            ),
        ),
        [
            ("A", "A B C D", False),
            ("B", "A D C B", True),
            ("C", "A C D B", False),
            ("D", "A D B C", False),
        ],
        difficulty=3, time_mins=4,
    ),

    _rich_item(
        "js_workshop_react_dependency", "React — Hooks", "WEB-240",
        tt_rich_doc(
            tt_paragraph(
                tt_text("Read the React component below. The dependency array on "),
                tt_text("useEffect", "code"),
                tt_text(" determines when the effect re-runs:"),
            ),
            tt_code_block(
                "function Search({ query }) {\n"
                "  const [results, setResults] = useState([]);\n"
                "\n"
                "  useEffect(() => {\n"
                "    let cancelled = false;\n"
                "    fetch(`/api/search?q=${query}`)\n"
                "      .then(r => r.json())\n"
                "      .then(data => { if (!cancelled) setResults(data); });\n"
                "    return () => { cancelled = true; };\n"
                "  }, []); // ← empty deps\n"
                "\n"
                "  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>;\n"
                "}",
                language="tsx",
            ),
            tt_paragraph(
                tt_text("Which bug is most clearly present?", "bold"),
            ),
        ),
        [
            ("A", "The fetch never runs because the component renders before useEffect.", False),
            ("B", "Stale-closure bug: query updates never re-trigger the fetch.", True),
            ("C", "The cancellation flag leaks memory across renders.", False),
            ("D", "The component throws when results is empty on first render.", False),
        ],
        difficulty=3, time_mins=4,
    ),

    _rich_item(
        "js_workshop_truthy", "JavaScript — Truthiness", "WEB-240",
        tt_rich_doc(
            tt_paragraph(
                tt_text("JavaScript coerces values to booleans in conditionals. The "),
                tt_text("falsy", "italic"),
                tt_text(" values are: "),
                tt_text("false", "code"),
                tt_text(", "),
                tt_text("0", "code"),
                tt_text(", "),
                tt_text("''", "code"),
                tt_text(", "),
                tt_text("null", "code"),
                tt_text(", "),
                tt_text("undefined", "code"),
                tt_text(", and "),
                tt_text("NaN", "code"),
                tt_text("."),
            ),
            tt_code_block(
                "const values = [0, '', '0', [], {}, null, NaN];\n"
                "const truthyCount = values.filter(Boolean).length;\n"
                "console.log(truthyCount);",
                language="javascript",
            ),
            tt_paragraph(
                tt_text("What does this snippet log?", "bold"),
            ),
        ),
        [
            ("A", "0", False),
            ("B", "3", True),
            ("C", "5", False),
            ("D", "7", False),
        ],
        difficulty=3, time_mins=3,
    ),

    _rich_essay(
        "js_workshop_security_essay", "Web — XSS defence", "WEB-240",
        tt_rich_doc(
            tt_paragraph(
                tt_text("A junior developer ships the following Express handler that renders a comment back into an HTML page:"),
            ),
            tt_code_block(
                "app.get('/comments/:id', async (req, res) => {\n"
                "  const comment = await db.getComment(req.params.id);\n"
                "  res.send(`\n"
                "    <h1>${comment.author}</h1>\n"
                "    <article>${comment.body}</article>\n"
                "  `);\n"
                "});",
                language="javascript",
            ),
            tt_paragraph(
                tt_text("In 120-250 words: "),
                tt_text("(a)", "bold"),
                tt_text(" explain the concrete attack a malicious user could mount against this endpoint, "),
                tt_text("(b)", "bold"),
                tt_text(" describe the minimum defensive change you'd make on the server side, and "),
                tt_text("(c)", "bold"),
                tt_text(" name one additional defence-in-depth header you would add."),
            ),
        ),
        min_words=120, max_words=250, points=6, time_mins=12,
        rubric="2pts per part. Full credit: stored/reflected XSS via comment.body executing JS in the victim's browser; HTML-escape comment.author + comment.body (or use a template engine that auto-escapes); Content-Security-Policy (or X-Content-Type-Options / Referrer-Policy / etc.).",
    ),
]


QUESTION_CATALOG.extend(PY_WORKSHOP_ITEMS)
QUESTION_CATALOG.extend(JS_WORKSHOP_ITEMS)


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


def catalog_slugs(course_code: str, *, essays: bool | None = None) -> list[str]:
    """Return seeded item slugs for a course, optionally filtered by essay type."""
    slugs: list[str] = []
    for item in QUESTION_CATALOG:
        if item.get("course_code") != course_code:
            continue
        is_essay = item["question_type"] == QuestionType.ESSAY
        if essays is True and not is_essay:
            continue
        if essays is False and is_essay:
            continue
        slugs.append(item["slug"])
    return slugs


def fixed_rules_for_slugs(learning_objects: dict, slugs: list[str]) -> list[dict]:
    """Convert item slugs into fixed selection rules."""
    return [fixed_rule(learning_objects[slug].id) for slug in slugs if slug in learning_objects]


def build_curriculum_blueprint_specs(learning_objects: dict) -> list[dict]:
    """Create per-course quizzes/midterms plus short functionality fixtures."""
    specs: list[dict] = []

    for course_code, course_title in COURSE_SPECS:
        objective_slugs = catalog_slugs(course_code, essays=False)
        essay_slugs = catalog_slugs(course_code, essays=True)

        quiz_slugs = objective_slugs[:6]
        midterm_objective_slugs = objective_slugs[3:13] if len(objective_slugs) >= 13 else objective_slugs[:10]
        essay_slug = essay_slugs[0] if essay_slugs else None
        essay_points = {str(learning_objects[essay_slug].id): 6} if essay_slug else {}

        specs.append({
            "title": f"{course_title} - Quiz 1",
            "description": f"Short formative quiz covering early {course_title} topics.",
            "blocks": [
                {"title": "Core checks", "rules": fixed_rules_for_slugs(learning_objects, quiz_slugs)},
            ],
            "duration_minutes": 20,
            "shuffle_questions": False,
            "scoring_config": {"shuffle_options": True, "pass_percentage": 50},
        })

        specs.append({
            "title": f"{course_title} - Midterm",
            "description": f"Balanced midterm for {course_title}, with objective questions and one written response.",
            "blocks": [
                {"title": "Concepts", "rules": fixed_rules_for_slugs(learning_objects, midterm_objective_slugs[:5])},
                {"title": "Application", "rules": fixed_rules_for_slugs(learning_objects, midterm_objective_slugs[5:10])},
                {"title": "Open Response", "rules": fixed_rules_for_slugs(learning_objects, [essay_slug] if essay_slug else [])},
            ],
            "duration_minutes": 60,
            "shuffle_questions": False,
            "scoring_config": {
                "shuffle_options": True,
                "multiple_response_strategy": "PARTIAL_CREDIT",
                "pass_percentage": 55,
                "essay_points": essay_points,
            },
        })

    return specs


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
    scheduled_session_id=None,
    session_mode: ExamSessionMode = ExamSessionMode.ASSIGNED,
) -> ExamSession:
    """Create a graded ASSIGNED attempt. ``scheduled_session_id`` links the
    attempt back to a scheduled exam window (the Epoch 8.6 per-run drill-in
    uses this); ``session_mode`` switches to PRACTICE for the practice bucket.
    """
    snapshots = [build_item_snapshot(item_versions[slug]) for slug in item_slugs]

    # expires_at = start + the test's own duration. The old `submitted_at + 2min`
    # gave a meaningless window that contradicted both the blueprint duration
    # and any future "did this submission beat the window?" logic.
    duration = blueprint.duration_minutes or 30
    exam_session = ExamSession(
        test_definition_id=blueprint.id,
        student_id=student.id,
        scheduled_session_id=scheduled_session_id,
        items=snapshots,
        status=SessionStatus.SUBMITTED,
        session_mode=session_mode,
        started_at=started_at,
        submitted_at=submitted_at,
        expires_at=started_at + timedelta(minutes=duration),
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
    # Sessions with no pending manual work are fully complete regardless of whether
    # any human grading was needed (epoch 7.9: AUTO_GRADED collapses into FULLY_GRADED).
    grading_status = GradingStatus.FULLY_GRADED

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


# ─────────────────────────────────────────────────────────────────────────────
# Analytics-grade bulk seeding
#
# These helpers create enough graded sessions across enough students that the
# psychometric analytics dashboards (P-value, D-value, distractor analysis,
# Cronbach's Alpha, score distribution, cut-score scenarios) actually render
# meaningful charts. Without the bulk wave the dashboard shows ~6 sessions
# total per test, which is below the threshold for stable statistics and looks
# empty in the UI.
# ─────────────────────────────────────────────────────────────────────────────

ANALYTICS_STUDENT_PROFILES = [
    # (first_name, email, ability) — ability biases the per-item correctness
    # probability so high-ability students consistently outperform low-ability
    # ones. This produces realistic point-biserial discrimination scores.
    ("Aria",   "aria.student@vu.nl",   0.25),
    ("Bram",   "bram.student@vu.nl",   0.22),
    ("Cleo",   "cleo.student@vu.nl",   0.20),
    ("Daan",   "daan.student@vu.nl",   0.18),
    ("Eli",    "eli.student@vu.nl",    0.15),
    ("Faye",   "faye.student@vu.nl",   0.12),
    ("Guus",   "guus.student@vu.nl",   0.10),
    ("Hana",   "hana.student@vu.nl",   0.08),
    ("Iris",   "iris.student@vu.nl",   0.05),
    ("Jakob",  "jakob.student@vu.nl",  0.03),
    ("Kira",   "kira.student@vu.nl",   0.00),
    ("Lin",    "lin.student@vu.nl",    0.00),
    ("Mira",   "mira.student@vu.nl",  -0.02),
    ("Niels",  "niels.student@vu.nl", -0.05),
    ("Otto",   "otto.student@vu.nl",  -0.08),
    ("Pia",    "pia.student@vu.nl",   -0.10),
    ("Quinn",  "quinn.student@vu.nl", -0.13),
    ("Rosa",   "rosa.student@vu.nl",  -0.15),
    ("Sami",   "sami.student@vu.nl",  -0.18),
    ("Tess",   "tess.student@vu.nl",  -0.20),
    ("Uri",    "uri.student@vu.nl",   -0.22),
    ("Vera",   "vera.student@vu.nl",  -0.25),
    ("Wout",   "wout.student@vu.nl",  -0.27),
    ("Xinran", "xinran.student@vu.nl", -0.29),
    ("Yara",   "yara.student@vu.nl",  -0.30),
]


# Target P-values per item drive the underlying correctness probability before
# the student-ability bias is applied. A handful of extreme values is
# intentional so the dashboard's "Flagged Items" section is populated with
# realistic TOO_EASY / TOO_HARD / POOR_DISCRIMINATION exemplars.
ITEM_TARGET_P = {
    # Algorithms
    "algo_linear_search_bigo":      0.88,
    "algo_binary_search_pre":       0.72,
    "algo_merge_sort_bigo":         0.68,
    "algo_quicksort_worst":         0.55,
    "algo_dp_memoization":          0.32,   # TOO_HARD
    "algo_dijkstra_purpose":        0.58,
    "algo_traversal_types":         0.62,
    "algo_complexity_essay":        None,   # essay
    # Data Structures
    "ds_stack_lifo":                0.95,   # TOO_EASY
    "ds_hashmap_collision":         0.65,
    "ds_linked_list_index":         0.70,
    "ds_bst_search":                0.62,
    "ds_heap_property":             0.50,
    "ds_graph_representation":      0.55,
    "ds_trie_use_case":             0.30,   # TOO_HARD
    "ds_amortized_arraylist":       0.45,
    # Operating Systems
    "os_process_vs_thread":         0.70,
    "os_context_switch_cost":       0.50,
    "os_scheduling_algos":          0.58,
    "os_deadlock_conditions":       0.42,
    "os_virtual_memory_purpose":    0.60,
    "os_mutex_vs_semaphore":        0.28,   # TOO_HARD
    "os_fork_semantics":            0.45,
    "os_paging_essay":              None,
    # Databases
    "db_sql_inner_join":            0.78,
    "db_primary_vs_foreign_key":    0.80,
    "db_normalization_3nf":         0.50,
    "db_index_tradeoff":            0.55,
    "db_acid_atomicity":            0.65,
    "db_acid_isolation":            0.40,
    "db_nosql_when":                0.55,
    "db_transaction_essay":         None,
    # Networking
    "net_tcp_vs_udp":               0.72,
    "net_dns_purpose":              0.93,   # TOO_EASY
    "net_http_methods":             0.55,
    "net_osi_layers":               0.60,
    "net_tls_handshake":            0.32,   # TOO_HARD
    "net_routing_essay":            None,
    # Security
    "sec_password_hashing":         0.62,
    "sec_sql_injection":            0.68,
    "sec_xss_vs_csrf":              0.40,
    "sec_jwt_purpose":              0.55,
    "sec_design_essay":             None,
    # Machine Learning
    "ml_supervised_vs_unsupervised":0.75,
    "ml_overfitting_sign":          0.62,
    "ml_gradient_descent":          0.42,
    "ml_bias_fairness_essay":       None,
    # Software Engineering
    "swe_git_merge_vs_rebase":      0.52,
    "swe_code_review_purpose":      0.75,
    "swe_solid_principle":          0.30,   # TOO_HARD
}

# Items where ability has minimal effect on correctness — surfaces
# POOR_DISCRIMINATION flags in the analytics dashboard.
LOW_DISCRIMINATION_ITEMS = {"ds_stack_lifo", "net_dns_purpose"}


def _stable_random(*parts: str) -> Random:
    """Deterministic per-(student, item, wave) RNG so re-runs are reproducible."""
    digest = hashlib.md5("::".join(parts).encode()).hexdigest()
    return Random(int(digest, 16))


def _select_choice_id(choices: list, target_correct: bool, rng: Random) -> str:
    """Pick a correct or incorrect option id, biasing wrong picks toward
    plausible distractors so distractor-analysis bars are non-uniform."""
    correct_ids = [c["id"] for c in choices if c.get("is_correct")]
    incorrect_ids = [c["id"] for c in choices if not c.get("is_correct")]
    if target_correct and correct_ids:
        return rng.choice(correct_ids)
    if not incorrect_ids:
        return correct_ids[0] if correct_ids else choices[0]["id"]
    # Weight first listed distractor a bit higher so the bar chart isn't flat.
    weights = [3] + [1] * (len(incorrect_ids) - 1)
    return rng.choices(incorrect_ids, weights=weights, k=1)[0]


def _select_multi_response(choices: list, target_correct: bool, rng: Random) -> list[str]:
    correct_ids = [c["id"] for c in choices if c.get("is_correct")]
    incorrect_ids = [c["id"] for c in choices if not c.get("is_correct")]
    if target_correct:
        return correct_ids
    # Fail in different ways: drop one correct, add one wrong, or pick all.
    mode = rng.randint(0, 2)
    if mode == 0 and len(correct_ids) > 1:
        dropped = rng.choice(correct_ids)
        return [cid for cid in correct_ids if cid != dropped]
    if mode == 1 and incorrect_ids:
        return correct_ids + [rng.choice(incorrect_ids)]
    return correct_ids[:1] if correct_ids else [choices[0]["id"]]


def _essay_response(ability: float, rng: Random) -> dict:
    """Generate a reasonable essay grade biased by student ability (max 6 pts)."""
    base = 3.5 + ability * 6  # ability ∈ [-0.30, 0.25] → roughly 1.7–5.0
    jitter = rng.uniform(-1.0, 1.0)
    points = max(0.0, min(6.0, round(base + jitter)))
    if points >= 5:
        feedback = "Strong fairness analysis with a concrete safeguard."
    elif points >= 3:
        feedback = "Reasonable risk identified; safeguard could be sharper."
    else:
        feedback = "Limited engagement with the prompt — revisit risk and mitigation."
    return {
        "text": (
            "Risk: training data may under-represent multilingual students, "
            "leading the model to over-flag them as at risk. "
            "Safeguard: subgroup audits with human review before any flag is shown."
        ),
        "points_awarded": points,
        "feedback": feedback,
    }


def create_bulk_attempt(
    db,
    *,
    blueprint: TestDefinition,
    student: User,
    grader: User,
    publisher: User,
    item_versions_for_attempt: dict[str, ItemVersion],
    item_slugs: list[str],
    ability: float,
    started_at: datetime,
    submitted_at: datetime,
    published: bool,
    wave: str = "v1",
    scheduled_session_id=None,
    session_mode: ExamSessionMode = ExamSessionMode.ASSIGNED,
    grade_essays: bool = True,
) -> ExamSession:
    """Create a graded exam session whose answers are derived from the student's
    ability profile and per-item target P-values. Used to bulk-populate the
    analytics dashboard with realistic dummy data. ``scheduled_session_id``
    optionally links the attempt to a specific scheduled-session run.

    When ``grade_essays`` is False, essay items are left ungraded (no feedback,
    no points awarded) and the resulting session_result is forced to
    PARTIALLY_GRADED + is_published=False — populates the manual grading queue.
    """
    snapshots = [build_item_snapshot(item_versions_for_attempt[slug]) for slug in item_slugs]

    duration = blueprint.duration_minutes or 30
    exam_session = ExamSession(
        test_definition_id=blueprint.id,
        student_id=student.id,
        scheduled_session_id=scheduled_session_id,
        items=snapshots,
        status=SessionStatus.SUBMITTED,
        session_mode=session_mode,
        started_at=started_at,
        submitted_at=submitted_at,
        expires_at=started_at + timedelta(minutes=duration),
    )
    db.add(exam_session)
    db.flush()

    grade_rows: list[QuestionGrade] = []
    total_points = 0.0
    max_points = 0.0
    has_manual_grade = False

    for position, slug in enumerate(item_slugs):
        snapshot = snapshots[position]
        item_version = item_versions_for_attempt[slug]
        rng = _stable_random(student.email, slug, wave, str(blueprint.id))
        row_created_at = submitted_at + timedelta(seconds=position)
        question_type = snapshot["question_type"]
        options = snapshot["options"]
        target_p = ITEM_TARGET_P.get(slug)

        if question_type == QuestionType.ESSAY.value:
            essay = _essay_response(ability, rng)
            points_possible = float((item_version.metadata_tags or {}).get("points", 6))
            has_manual_grade = True
            if grade_essays:
                points_awarded = float(essay["points_awarded"])
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
                        feedback=essay["feedback"],
                        student_answer={"text": essay["text"]},
                        correct_answer=None,
                        created_at=row_created_at,
                        updated_at=row_created_at,
                    )
                )
            else:
                # Ungraded essay — populates the manual grading queue.
                # Mirrors what `auto_grade_session` writes when it encounters
                # an essay: 0 points, no feedback, is_correct=None.
                grade_rows.append(
                    QuestionGrade(
                        session_id=exam_session.id,
                        learning_object_id=item_version.learning_object_id,
                        item_version_id=item_version.id,
                        points_awarded=0.0,
                        points_possible=points_possible,
                        is_correct=None,
                        is_auto_graded=False,
                        feedback=None,
                        student_answer={"text": essay["text"]},
                        correct_answer=None,
                        created_at=row_created_at,
                    )
                )
        else:
            # Apply ability bias unless this item is intentionally weakly
            # discriminating (then ability barely matters).
            if slug in LOW_DISCRIMINATION_ITEMS:
                threshold = target_p if target_p is not None else 0.5
            else:
                threshold = max(0.02, min(0.98, (target_p or 0.5) + ability))
            target_correct = rng.random() < threshold
            choices = get_option_choices(options)

            if question_type == QuestionType.MULTIPLE_RESPONSE.value:
                selected_ids = _select_multi_response(choices, target_correct, rng)
                student_answer = build_multiple_response_answer(options, selected_ids)
                correct_indices = get_correct_indices(options)
                is_correct = set(student_answer["selected_option_indices"]) == set(correct_indices)
            else:
                selected_id = _select_choice_id(choices, target_correct, rng)
                student_answer = build_mcq_answer(options, selected_id)
                correct_indices = get_correct_indices(options)
                is_correct = student_answer["selected_option_index"] in correct_indices

            grade_rows.append(
                QuestionGrade(
                    session_id=exam_session.id,
                    learning_object_id=item_version.learning_object_id,
                    item_version_id=item_version.id,
                    points_awarded=1.0 if is_correct else 0.0,
                    points_possible=1.0,
                    is_correct=is_correct,
                    is_auto_graded=True,
                    student_answer=student_answer,
                    correct_answer={"correct_indices": correct_indices},
                    created_at=row_created_at,
                )
            )

        total_points += grade_rows[-1].points_awarded
        max_points += grade_rows[-1].points_possible

    db.add_all(grade_rows)

    pending_manual = sum(
        1 for g in grade_rows
        if not g.is_auto_graded and g.is_correct is None and g.feedback is None
    )
    questions_graded = len(grade_rows) - pending_manual
    if pending_manual == 0:
        grading_status = GradingStatus.FULLY_GRADED
    else:
        grading_status = GradingStatus.PARTIALLY_GRADED

    percentage, letter_grade, passed = format_grade_result(total_points, max_points)
    # Cannot publish a result whose essays are still in the grading queue.
    effective_published = published and pending_manual == 0
    published_at = submitted_at + timedelta(hours=2) if effective_published else None

    db.add(
        SessionResult(
            session_id=exam_session.id,
            test_definition_id=blueprint.id,
            student_id=student.id,
            total_points=round(total_points, 2),
            max_points=round(max_points, 2),
            percentage=percentage,
            grading_status=grading_status,
            questions_graded=questions_graded,
            questions_total=len(grade_rows),
            letter_grade=letter_grade,
            passed=passed,
            is_published=effective_published,
            published_at=published_at,
            published_by=publisher.id if effective_published else None,
            created_at=submitted_at,
            updated_at=published_at if effective_published else submitted_at,
        )
    )

    return exam_session


# Per-blueprint configuration: which item slugs the bulk wave uses and how
# many staggered attempts to create per blueprint. Mirrors the curated
# blueprint specs further down in seed() but lets the analytics wave run
# independently of the demo attempts.
BULK_BLUEPRINT_ITEMS = {
    "Programming Foundations - Intro Midterm": [
        # Mix of intro DS / algorithms / OS / networking concepts.
        "ds_stack_lifo", "ds_hashmap_collision", "ds_linked_list_index",
        "algo_linear_search_bigo", "algo_binary_search_pre", "algo_merge_sort_bigo",
        "os_process_vs_thread", "os_virtual_memory_purpose",
        "net_tcp_vs_udp", "net_dns_purpose",
        "db_primary_vs_foreign_key", "swe_code_review_purpose",
        "algo_complexity_essay",
    ],
    "Data Structures and Algorithms - Final": [
        # Heavy DS + algorithms cohort with a complexity-trace essay.
        "ds_hashmap_collision", "ds_linked_list_index", "ds_bst_search",
        "ds_heap_property", "ds_graph_representation", "ds_trie_use_case",
        "ds_amortized_arraylist",
        "algo_binary_search_pre", "algo_merge_sort_bigo", "algo_quicksort_worst",
        "algo_dp_memoization", "algo_dijkstra_purpose", "algo_traversal_types",
        "algo_complexity_essay",
    ],
    "Operating Systems - Applied Midterm": [
        "os_process_vs_thread", "os_context_switch_cost", "os_scheduling_algos",
        "os_deadlock_conditions", "os_virtual_memory_purpose",
        "os_mutex_vs_semaphore", "os_fork_semantics",
        "ds_stack_lifo", "ds_amortized_arraylist",
        "os_paging_essay",
    ],
    "Database Systems - SQL Quiz": [
        "db_sql_inner_join", "db_primary_vs_foreign_key", "db_normalization_3nf",
        "db_index_tradeoff", "db_acid_atomicity", "db_acid_isolation",
        "db_nosql_when", "db_transaction_essay",
    ],
    "Computer Networks - Security Quiz": [
        "net_tcp_vs_udp", "net_dns_purpose", "net_http_methods",
        "net_osi_layers", "net_tls_handshake",
        "sec_password_hashing", "sec_sql_injection", "sec_xss_vs_csrf",
        "sec_jwt_purpose",
        "net_routing_essay",
    ],
}


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
        db.query(LearningObject).delete()
        db.query(Course).delete()
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

        analytics_students: list[tuple[User, float]] = []
        for first_name, email, ability in ANALYTICS_STUDENT_PROFILES:
            analytics_user = ensure_user(
                db,
                email=email,
                password="studentpass123",
                role=UserRole.STUDENT,
            )
            analytics_students.append((analytics_user, ability))
        db.commit()

        courses = {}
        enrolled_students = [student, alex, maya, noor, liam] + [u for u, _ in analytics_students]
        for code, title in COURSE_SPECS:
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

        bank = ItemBank(name="OpenVision Demo Bank", created_by=constructor.id)
        db.add(bank)
        db.flush()

        learning_objects = {}
        item_versions = {}
        for item in QUESTION_CATALOG:
            course = courses.get(item.get("course_code"))
            learning_object = LearningObject(
                bank_id=bank.id,
                course_id=course.id if course else None,
                created_by=constructor.id,
            )
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

        # Pre-fetch the essay LOs we reference in scoring_config.
        algo_essay_lo = learning_objects["algo_complexity_essay"]
        os_essay_lo = learning_objects["os_paging_essay"]
        db_essay_lo = learning_objects["db_transaction_essay"]
        net_essay_lo = learning_objects["net_routing_essay"]

        blueprint_specs = [
            {
                "title": "Programming Foundations - Intro Midterm",
                "description": (
                    "Mid-semester check on intro-level computer science: data structures, "
                    "algorithm complexity, basic OS and networking vocabulary, and a short "
                    "complexity-trace essay."
                ),
                "blocks": [
                    {
                        "title": "Data Structures",
                        "rules": [
                            fixed_rule(learning_objects["ds_stack_lifo"].id),
                            fixed_rule(learning_objects["ds_hashmap_collision"].id),
                            fixed_rule(learning_objects["ds_linked_list_index"].id),
                        ],
                    },
                    {
                        "title": "Algorithm Complexity",
                        "rules": [
                            fixed_rule(learning_objects["algo_linear_search_bigo"].id),
                            fixed_rule(learning_objects["algo_binary_search_pre"].id),
                            fixed_rule(learning_objects["algo_merge_sort_bigo"].id),
                        ],
                    },
                    {
                        "title": "Systems & Networking Intro",
                        "rules": [
                            fixed_rule(learning_objects["os_process_vs_thread"].id),
                            fixed_rule(learning_objects["os_virtual_memory_purpose"].id),
                            fixed_rule(learning_objects["net_tcp_vs_udp"].id),
                            fixed_rule(learning_objects["net_dns_purpose"].id),
                        ],
                    },
                    {
                        "title": "Practice & Schema",
                        "rules": [
                            fixed_rule(learning_objects["db_primary_vs_foreign_key"].id),
                            fixed_rule(learning_objects["swe_code_review_purpose"].id),
                        ],
                    },
                    {
                        "title": "Open Response",
                        "rules": [fixed_rule(algo_essay_lo.id)],
                    },
                ],
                "duration_minutes": 60,
                "shuffle_questions": False,
                "scoring_config": {
                    "shuffle_options": True,
                    "multiple_response_strategy": "ALL_OR_NOTHING",
                    "pass_percentage": 55,
                    "essay_points": {str(algo_essay_lo.id): 6},
                },
            },
            {
                "title": "Data Structures and Algorithms - Final",
                "description": (
                    "End-of-semester final covering hash maps, trees, heaps, graphs, "
                    "and the core algorithmic techniques (search, sort, recursion, dynamic "
                    "programming, shortest paths). Closes with a quantitative complexity essay."
                ),
                "blocks": [
                    {
                        "title": "Linear Structures",
                        "rules": [
                            fixed_rule(learning_objects["ds_hashmap_collision"].id),
                            fixed_rule(learning_objects["ds_linked_list_index"].id),
                            fixed_rule(learning_objects["ds_amortized_arraylist"].id),
                        ],
                    },
                    {
                        "title": "Trees & Graphs",
                        "rules": [
                            fixed_rule(learning_objects["ds_bst_search"].id),
                            fixed_rule(learning_objects["ds_heap_property"].id),
                            fixed_rule(learning_objects["ds_graph_representation"].id),
                            fixed_rule(learning_objects["ds_trie_use_case"].id),
                            fixed_rule(learning_objects["algo_traversal_types"].id),
                        ],
                    },
                    {
                        "title": "Algorithm Design",
                        "rules": [
                            fixed_rule(learning_objects["algo_binary_search_pre"].id),
                            fixed_rule(learning_objects["algo_merge_sort_bigo"].id),
                            fixed_rule(learning_objects["algo_quicksort_worst"].id),
                            fixed_rule(learning_objects["algo_dp_memoization"].id),
                            fixed_rule(learning_objects["algo_dijkstra_purpose"].id),
                        ],
                    },
                    {
                        "title": "Open Response",
                        "rules": [fixed_rule(algo_essay_lo.id)],
                    },
                ],
                "duration_minutes": 90,
                "shuffle_questions": False,
                "scoring_config": {
                    "shuffle_options": True,
                    "multiple_response_strategy": "ALL_OR_NOTHING",
                    "pass_percentage": 55,
                    "essay_points": {str(algo_essay_lo.id): 6},
                },
            },
            {
                "title": "Operating Systems - Applied Midterm",
                "description": (
                    "Midterm covering processes vs threads, scheduling, deadlock, virtual "
                    "memory, and synchronisation primitives. Closes with a paging-translation essay."
                ),
                "blocks": [
                    {
                        "title": "Processes & Threads",
                        "rules": [
                            fixed_rule(learning_objects["os_process_vs_thread"].id),
                            fixed_rule(learning_objects["os_fork_semantics"].id),
                            fixed_rule(learning_objects["os_context_switch_cost"].id),
                        ],
                    },
                    {
                        "title": "Scheduling & Concurrency",
                        "rules": [
                            fixed_rule(learning_objects["os_scheduling_algos"].id),
                            fixed_rule(learning_objects["os_deadlock_conditions"].id),
                            fixed_rule(learning_objects["os_mutex_vs_semaphore"].id),
                        ],
                    },
                    {
                        "title": "Memory & Storage",
                        "rules": [
                            fixed_rule(learning_objects["os_virtual_memory_purpose"].id),
                            fixed_rule(learning_objects["ds_stack_lifo"].id),
                            fixed_rule(learning_objects["ds_amortized_arraylist"].id),
                        ],
                    },
                    {
                        "title": "Open Response",
                        "rules": [fixed_rule(os_essay_lo.id)],
                    },
                ],
                "duration_minutes": 75,
                "shuffle_questions": False,
                "scoring_config": {
                    "shuffle_options": True,
                    "multiple_response_strategy": "ALL_OR_NOTHING",
                    "pass_percentage": 55,
                    "essay_points": {str(os_essay_lo.id): 6},
                },
            },
            {
                "title": "Database Systems - SQL Quiz",
                "description": (
                    "Focused quiz on SQL joins, normalisation, indexing trade-offs, ACID "
                    "guarantees, NoSQL fit, and an isolation-level essay."
                ),
                "blocks": [
                    {
                        "title": "SQL & Schema",
                        "rules": [
                            fixed_rule(learning_objects["db_sql_inner_join"].id),
                            fixed_rule(learning_objects["db_primary_vs_foreign_key"].id),
                            fixed_rule(learning_objects["db_normalization_3nf"].id),
                            fixed_rule(learning_objects["db_index_tradeoff"].id),
                        ],
                    },
                    {
                        "title": "Transactions & ACID",
                        "rules": [
                            fixed_rule(learning_objects["db_acid_atomicity"].id),
                            fixed_rule(learning_objects["db_acid_isolation"].id),
                            fixed_rule(learning_objects["db_nosql_when"].id),
                        ],
                    },
                    {
                        "title": "Open Response",
                        "rules": [fixed_rule(db_essay_lo.id)],
                    },
                ],
                "duration_minutes": 50,
                "shuffle_questions": False,
                "scoring_config": {
                    "shuffle_options": True,
                    "pass_percentage": 55,
                    "essay_points": {str(db_essay_lo.id): 6},
                },
            },
            {
                "title": "Computer Networks - Security Quiz",
                "description": (
                    "End-of-module quiz covering TCP/UDP, DNS, HTTP semantics, TLS, "
                    "common web-security defences, and a routing essay."
                ),
                "blocks": [
                    {
                        "title": "Transport & Application",
                        "rules": [
                            fixed_rule(learning_objects["net_tcp_vs_udp"].id),
                            fixed_rule(learning_objects["net_dns_purpose"].id),
                            fixed_rule(learning_objects["net_http_methods"].id),
                            fixed_rule(learning_objects["net_osi_layers"].id),
                            fixed_rule(learning_objects["net_tls_handshake"].id),
                        ],
                    },
                    {
                        "title": "Security Fundamentals",
                        "rules": [
                            fixed_rule(learning_objects["sec_password_hashing"].id),
                            fixed_rule(learning_objects["sec_sql_injection"].id),
                            fixed_rule(learning_objects["sec_xss_vs_csrf"].id),
                            fixed_rule(learning_objects["sec_jwt_purpose"].id),
                        ],
                    },
                    {
                        "title": "Open Response",
                        "rules": [fixed_rule(net_essay_lo.id)],
                    },
                ],
                "duration_minutes": 60,
                "shuffle_questions": False,
                "scoring_config": {
                    "shuffle_options": True,
                    "multiple_response_strategy": "ALL_OR_NOTHING",
                    "pass_percentage": 55,
                    "essay_points": {str(net_essay_lo.id): 6},
                },
            },
        ]

        # ── Rich-content workshop blueprints. Use TipTap docs with bold /
        # italic / inline-code / multi-line code-block content so the editor's
        # rich-rendering can be visually verified in author + exam-taker UIs.
        py_workshop_essay_lo = learning_objects["py_workshop_refactor_essay"]
        js_workshop_essay_lo = learning_objects["js_workshop_security_essay"]
        blueprint_specs.append({
            "title": "Python — Code Reading Workshop",
            "description": (
                "Six rich-content questions on Python pitfalls. Each prompt mixes "
                "bold/italic emphasis, inline `code`, and multi-line code blocks "
                "so reviewers can sanity-check how rich text renders end-to-end."
            ),
            "blocks": [
                {
                    "title": "Reading code",
                    "rules": [
                        fixed_rule(learning_objects["py_workshop_dict_default"].id),
                        fixed_rule(learning_objects["py_workshop_list_aliasing"].id),
                        fixed_rule(learning_objects["py_workshop_comprehension"].id),
                    ],
                },
                {
                    "title": "Avoiding pitfalls",
                    "rules": [
                        fixed_rule(learning_objects["py_workshop_default_arg"].id),
                        fixed_rule(learning_objects["py_workshop_generator_lazy"].id),
                    ],
                },
                {
                    "title": "Refactoring (open response)",
                    "rules": [fixed_rule(py_workshop_essay_lo.id)],
                },
            ],
            "duration_minutes": 45,
            "shuffle_questions": False,
            "scoring_config": {
                "shuffle_options": True,
                "pass_percentage": 55,
                "essay_points": {str(py_workshop_essay_lo.id): 6},
            },
        })
        blueprint_specs.append({
            "title": "Web Application Development — Code Review",
            "description": (
                "Five JS/TS code-reading questions plus a short security-review "
                "essay. Prompts include multi-line code blocks (JS, TSX) and "
                "inline `code` so the rich-text renderer gets a full workout."
            ),
            "blocks": [
                {
                    "title": "Language semantics",
                    "rules": [
                        fixed_rule(learning_objects["js_workshop_hoisting"].id),
                        fixed_rule(learning_objects["js_workshop_const_object"].id),
                        fixed_rule(learning_objects["js_workshop_truthy"].id),
                    ],
                },
                {
                    "title": "Runtime + frameworks",
                    "rules": [
                        fixed_rule(learning_objects["js_workshop_async_order"].id),
                        fixed_rule(learning_objects["js_workshop_react_dependency"].id),
                    ],
                },
                {
                    "title": "Security review (open response)",
                    "rules": [fixed_rule(js_workshop_essay_lo.id)],
                },
            ],
            "duration_minutes": 50,
            "shuffle_questions": False,
            "scoring_config": {
                "shuffle_options": True,
                "pass_percentage": 55,
                "essay_points": {str(js_workshop_essay_lo.id): 6},
            },
        })

        blueprint_specs.extend(build_curriculum_blueprint_specs(learning_objects))

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

        now = datetime.now(timezone.utc)
        # ── Epoch 8.6 Stage 2 — Two CLOSED scheduled runs for the same
        # blueprint (CS 202 Final) on two different courses. Demonstrates
        # the per-run grading picker: Run A on CS-202 (fall cohort), Run B
        # on CS-101 as a cross-listed re-sit (spring cohort), one day apart.
        ds_final_blueprint = blueprints["Data Structures and Algorithms - Final"]
        ds_final_run_a = ScheduledExamSession(
            course_id=courses["CS-202"].id,
            test_definition_id=ds_final_blueprint.id,
            created_by=constructor.id,
            starts_at=now - timedelta(days=2, minutes=30),
            ends_at=now - timedelta(days=2, minutes=5),
            status=CourseSessionStatus.CLOSED,
            duration_minutes_override=25,
        )
        ds_final_run_b = ScheduledExamSession(
            course_id=courses["CS-101"].id,
            test_definition_id=ds_final_blueprint.id,
            created_by=constructor.id,
            starts_at=now - timedelta(days=1, minutes=30),
            ends_at=now - timedelta(days=1, minutes=5),
            status=CourseSessionStatus.CLOSED,
            duration_minutes_override=25,
        )
        db.add_all([ds_final_run_a, ds_final_run_b])
        db.flush()

        # Helper for the CS 202 Final curated attempts — keeps the per-item
        # answer specs concise. The first essay text gets manual grading.
        ds_final_slugs = BULK_BLUEPRINT_ITEMS[
            "Data Structures and Algorithms - Final"
        ]

        def _ds_final_answers(*, strong: bool) -> dict:
            """Strong students get correct answers on most MCQ; weak students
            miss the harder ones. Essay is always graded later."""
            choices = {
                "ds_hashmap_collision":   "B" if strong else "A",
                "ds_linked_list_index":   "C" if strong else "A",
                "ds_bst_search":          "B" if strong else "C",
                "ds_heap_property":       "A" if strong else "B",
                "ds_graph_representation": ["A", "B", "C"] if strong else ["A", "D"],
                "ds_trie_use_case":       "B" if strong else "C",
                "ds_amortized_arraylist": "A" if strong else "C",
                "algo_binary_search_pre": "B",
                "algo_merge_sort_bigo":   "B" if strong else "C",
                "algo_quicksort_worst":   "B" if strong else "A",
                "algo_dp_memoization":    "A" if strong else "D",
                "algo_dijkstra_purpose":  "B" if strong else "C",
                "algo_traversal_types":   ["A", "B", "C"] if strong else ["A", "B"],
                "algo_complexity_essay": {
                    "text": (
                        "An O(n²) algorithm at n=10⁶ performs roughly 10¹² operations. "
                        "Modern CPUs sustain on the order of 10⁹ simple ops per second, "
                        "so the runtime is approximately 10³ seconds — about 16 minutes — "
                        "before accounting for cache misses. That makes the algorithm "
                        "impractical for any interactive workload."
                    ) if strong else (
                        "It would take a long time. Computers cannot do that many things."
                    ),
                    "points_awarded": 5.5 if strong else 1.5,
                    "feedback": (
                        "Excellent: concrete back-of-envelope with the right orders of magnitude."
                        if strong
                        else "Right intuition but no quantitative backing — needs the ops/sec calculation."
                    ),
                },
            }
            return choices

        # Run A — CS-202, three days ago. Alex (strong) and Maya (strong) wrote it.
        create_submitted_attempt(
            db,
            blueprint=ds_final_blueprint,
            student=alex,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=ds_final_slugs,
            answers=_ds_final_answers(strong=True),
            started_at=now - timedelta(days=2, minutes=28),
            submitted_at=now - timedelta(days=2, minutes=10),
            published=True,
            scheduled_session_id=ds_final_run_a.id,
        )
        create_submitted_attempt(
            db,
            blueprint=ds_final_blueprint,
            student=maya,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=ds_final_slugs,
            answers=_ds_final_answers(strong=True),
            started_at=now - timedelta(days=2, minutes=27),
            submitted_at=now - timedelta(days=2, minutes=8),
            published=True,
            scheduled_session_id=ds_final_run_a.id,
        )
        # Run B — CS-101 re-sit, one day ago. Noor (weak) sat it.
        create_submitted_attempt(
            db,
            blueprint=ds_final_blueprint,
            student=noor,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=ds_final_slugs,
            answers=_ds_final_answers(strong=False),
            started_at=now - timedelta(days=1, minutes=25),
            submitted_at=now - timedelta(days=1, minutes=8),
            published=True,
            scheduled_session_id=ds_final_run_b.id,
        )
        # ── A couple of single-blueprint curated attempts on other CS courses
        # so the grading-list landing page isn't dominated by CS 202.
        os_midterm_slugs = BULK_BLUEPRINT_ITEMS["Operating Systems - Applied Midterm"]
        create_submitted_attempt(
            db,
            blueprint=blueprints["Operating Systems - Applied Midterm"],
            student=liam,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=os_midterm_slugs,
            answers={
                "os_process_vs_thread":      "A",
                "os_fork_semantics":         "B",
                "os_context_switch_cost":    "B",
                "os_scheduling_algos":       ["A", "B", "C"],
                "os_deadlock_conditions":    ["A", "B", "C", "D"],
                "os_mutex_vs_semaphore":     "A",
                "os_virtual_memory_purpose": "B",
                "ds_stack_lifo":             "B",
                "ds_amortized_arraylist":    "A",
                "os_paging_essay": {
                    "text": (
                        "A virtual address is split into a page number and a page offset. "
                        "The MMU consults the TLB; on a hit, it returns the corresponding "
                        "frame number and reassembles the physical address. On a TLB miss, "
                        "the MMU walks the page table in memory (multi-level on modern x86), "
                        "which costs additional memory references. The retrieved translation "
                        "is then cached in the TLB."
                    ),
                    "points_awarded": 5.0,
                    "feedback": "Covers all four expected elements. Could mention the page-fault path.",
                },
            },
            started_at=now - timedelta(days=1, hours=6, minutes=18),
            submitted_at=now - timedelta(days=1, hours=5, minutes=8),
            published=True,
        )
        create_submitted_attempt(
            db,
            blueprint=blueprints["Database Systems - SQL Quiz"],
            student=maya,
            grader=constructor,
            publisher=admin,
            item_versions=item_versions,
            item_slugs=BULK_BLUEPRINT_ITEMS["Database Systems - SQL Quiz"],
            answers={
                "db_sql_inner_join":         "B",
                "db_primary_vs_foreign_key": "A",
                "db_normalization_3nf":      "C",
                "db_index_tradeoff":         "B",
                "db_acid_atomicity":         "B",
                "db_acid_isolation":         "B",
                "db_nosql_when":             "B",
                "db_transaction_essay": {
                    "text": (
                        "SERIALIZABLE prevents anomalies like phantom reads and write skew, "
                        "but at the cost of more aggressive locking (or, under SSI, more "
                        "transaction aborts). Under high contention this collapses concurrency "
                        "and forces clients into retry loops, so most systems default to "
                        "READ COMMITTED and only escalate where strict correctness is required."
                    ),
                    "points_awarded": 5.5,
                    "feedback": "Names both the anomaly and the concrete cost — clear answer.",
                },
            },
            started_at=now - timedelta(days=1, hours=3, minutes=12),
            submitted_at=now - timedelta(days=1, hours=2, minutes=27),
            published=True,
        )
        # ── Analytics wave 1: bulk graded attempts on the v1 item versions ──
        # Spreads attempts across the past 6 weeks so the score distribution,
        # Cronbach's Alpha and pass-rate metrics on the analytics dashboard
        # have enough data to be statistically meaningful.
        #
        # Each bulk blueprint gets its OWN scheduled CLOSED run on its natural
        # course. That way the per-run grading picker and analytics drill-in
        # see a real cohort instead of orphan ASSIGNED attempts (which would
        # show up in combined analytics but in no per-run bucket).
        wave1_blueprint_titles = list(BULK_BLUEPRINT_ITEMS.keys())
        bulk_course_for_blueprint = {
            "Programming Foundations - Intro Midterm":   "CS-101",
            "Data Structures and Algorithms - Final":    "CS-202",
            "Operating Systems - Applied Midterm":       "CS-301",
            "Database Systems - SQL Quiz":               "CS-305",
            "Computer Networks - Security Quiz":         "CS-350",
        }

        # Helper: realistic time-on-task. Stronger students finish closer to
        # 40% of the window; weakest sit close to the full duration. Adds a
        # bit of per-student jitter so the distribution isn't perfectly linear.
        def _realistic_submission(start: datetime, duration_minutes: int, ability: float, rng: Random) -> datetime:
            # Map ability ∈ [-0.30, +0.25] → factor ∈ [0.95, 0.40].
            ability_norm = max(0.0, min(1.0, (ability + 0.30) / 0.55))
            factor = 0.95 - 0.55 * ability_norm
            jitter = rng.uniform(-0.07, 0.10)
            factor = max(0.30, min(0.99, factor + jitter))
            minutes = max(5, int(duration_minutes * factor))
            return start + timedelta(minutes=minutes)

        wave1_runs: dict[str, ScheduledExamSession] = {}
        for blueprint_index, title in enumerate(wave1_blueprint_titles):
            blueprint = blueprints[title]
            course_code = bulk_course_for_blueprint.get(title, "CS-101")
            duration = blueprint.duration_minutes or 30
            # Wave 1 sat (42 - i*4) days back — staggered enough that the
            # analytics timeline shows a clear march of cohorts.
            run_starts_at = now - timedelta(days=42 - blueprint_index * 4, hours=10)
            run_ends_at = run_starts_at + timedelta(minutes=duration)
            run = ScheduledExamSession(
                course_id=courses[course_code].id,
                test_definition_id=blueprint.id,
                created_by=constructor.id,
                starts_at=run_starts_at,
                ends_at=run_ends_at,
                status=CourseSessionStatus.CLOSED,
                duration_minutes_override=duration,
            )
            db.add(run)
            db.flush()
            wave1_runs[title] = run

        wave1_attempts = 0
        for blueprint_index, title in enumerate(wave1_blueprint_titles):
            blueprint = blueprints[title]
            slugs = BULK_BLUEPRINT_ITEMS[title]
            run = wave1_runs[title]
            duration = blueprint.duration_minutes or 30
            for student_index, (analytics_student, ability) in enumerate(analytics_students):
                # Students "arrive" within the first 4 minutes of the window.
                started_at = run.starts_at + timedelta(seconds=student_index * 9 % 240)
                rng = _stable_random(analytics_student.email, "wave1-submit", title)
                submitted_at = _realistic_submission(started_at, duration, ability, rng)
                # A handful of students go right up to the wall (within 30s of expiry).
                if student_index % 11 == 0:
                    submitted_at = run.ends_at - timedelta(seconds=20 + student_index)
                create_bulk_attempt(
                    db,
                    blueprint=blueprint,
                    student=analytics_student,
                    grader=constructor,
                    publisher=admin,
                    item_versions_for_attempt=item_versions,
                    item_slugs=slugs,
                    ability=ability,
                    started_at=started_at,
                    submitted_at=submitted_at,
                    published=True,
                    wave="v1",
                    scheduled_session_id=run.id,
                )
                wave1_attempts += 1
        db.commit()

        # ── v2 item versions: revise three flagged items so the "Item History"
        # and "Version Trend" analytics views actually show movement.
        # The revisions are intended to bring the items inside healthy P/D
        # bounds (e.g. previously TOO_HARD becomes mid-range).
        # Revise three intentionally-flagged items so the analytics
        # "Item History" and "Version Trend" views show real movement
        # (e.g. a previously TOO_HARD item is rewritten and reaches a
        # mid-range P-value in the v2 wave).
        revised_items_spec = [
            {
                "slug": "algo_dp_memoization",
                "content": {
                    "text": (
                        "Memoization improves a recursive algorithm primarily by:"
                        " (Hint: think about repeated subproblems.)"
                    )
                },
                "options": {
                    "choices": [
                        {"id": "A", "text": "Caching the results of overlapping subproblems so they are computed once", "is_correct": True},
                        {"id": "B", "text": "Replacing recursion with bit manipulation", "is_correct": False},
                        {"id": "C", "text": "Switching to a divide-and-conquer pivot strategy", "is_correct": False},
                        {"id": "D", "text": "Compressing the call stack via tail calls", "is_correct": False},
                    ]
                },
                "new_target_p": 0.60,  # was 0.32 (TOO_HARD) — clearer wording lifts it to mid-range
            },
            {
                "slug": "os_mutex_vs_semaphore",
                "content": {
                    "text": (
                        "Which statement most clearly distinguishes a mutex from a counting semaphore?"
                    )
                },
                "options": {
                    "choices": [
                        {"id": "A", "text": "A mutex enforces single ownership of a resource; a counting semaphore tracks N available permits", "is_correct": True},
                        {"id": "B", "text": "A mutex never blocks; a semaphore always blocks", "is_correct": False},
                        {"id": "C", "text": "A mutex must be implemented in the kernel; a semaphore can be implemented in user space", "is_correct": False},
                        {"id": "D", "text": "A mutex is atomic; a semaphore is not", "is_correct": False},
                    ]
                },
                "new_target_p": 0.58,  # was 0.28 (TOO_HARD)
            },
            {
                "slug": "swe_solid_principle",
                "content": {
                    "text": (
                        "Which scenario most clearly violates the Single Responsibility Principle (SRP)?"
                    )
                },
                "options": {
                    "choices": [
                        {"id": "A", "text": "A `User` class that holds user fields AND writes user rows AND sends marketing emails", "is_correct": True},
                        {"id": "B", "text": "A function that uses early returns to reduce nesting", "is_correct": False},
                        {"id": "C", "text": "An interface that declares only the methods its consumers actually call", "is_correct": False},
                        {"id": "D", "text": "A class composed of two collaborators via constructor injection", "is_correct": False},
                    ]
                },
                "new_target_p": 0.65,  # was 0.30 (TOO_HARD)
            },
        ]

        revised_versions: dict[str, ItemVersion] = {}
        for spec in revised_items_spec:
            slug = spec["slug"]
            previous = item_versions[slug]
            previous.status = ItemStatus.RETIRED
            new_version = ItemVersion(
                learning_object_id=previous.learning_object_id,
                version_number=previous.version_number + 1,
                status=ItemStatus.APPROVED,
                question_type=previous.question_type,
                content=spec["content"],
                options=spec["options"],
                metadata_tags=previous.metadata_tags,
                created_by=constructor.id,
            )
            db.add(new_version)
            revised_versions[slug] = new_version
            ITEM_TARGET_P[slug] = spec["new_target_p"]
        db.flush()

        item_versions_v2 = dict(item_versions)
        item_versions_v2.update(revised_versions)

        # ── Analytics wave 2: smaller batch using v2 versions to populate the
        # per-item version-history charts. Spread across the most recent 10
        # days so the timeline shows a clear "after" cluster. Each wave-2
        # blueprint gets its own re-sit CLOSED run on the same course as
        # wave 1.
        wave2_runs: dict[str, ScheduledExamSession] = {}
        wave2_attempts = 0
        for blueprint_index, title in enumerate(wave1_blueprint_titles):
            slugs = BULK_BLUEPRINT_ITEMS[title]
            # Only bother with v2 for blueprints whose items got revised.
            if not any(slug in revised_versions for slug in slugs):
                continue
            blueprint = blueprints[title]
            course_code = bulk_course_for_blueprint.get(title, "CS-101")
            duration = blueprint.duration_minutes or 30
            run_starts_at = now - timedelta(days=9 - blueprint_index, hours=14)
            run_ends_at = run_starts_at + timedelta(minutes=duration)
            run = ScheduledExamSession(
                course_id=courses[course_code].id,
                test_definition_id=blueprint.id,
                created_by=constructor.id,
                starts_at=run_starts_at,
                ends_at=run_ends_at,
                status=CourseSessionStatus.CLOSED,
                duration_minutes_override=duration,
            )
            db.add(run)
            db.flush()
            wave2_runs[title] = run

            for student_index, (analytics_student, ability) in enumerate(analytics_students[:18]):
                started_at = run.starts_at + timedelta(seconds=student_index * 11 % 220)
                rng = _stable_random(analytics_student.email, "wave2-submit", title)
                submitted_at = _realistic_submission(started_at, duration, ability, rng)
                create_bulk_attempt(
                    db,
                    blueprint=blueprint,
                    student=analytics_student,
                    grader=constructor,
                    publisher=admin,
                    item_versions_for_attempt=item_versions_v2,
                    item_slugs=slugs,
                    ability=ability,
                    started_at=started_at,
                    submitted_at=submitted_at,
                    published=True,
                    wave="v2",
                    scheduled_session_id=run.id,
                )
                wave2_attempts += 1

        # ── Wave 3 — pending grading cohort.
        # 6 students sat the OS midterm and the Networks/Security quiz within
        # the last 3 days. Their essays are NOT yet graded, so:
        #   • grading_status = PARTIALLY_GRADED
        #   • is_published = False
        # This populates the grading queue dashboard with real work, and
        # validates that analytics correctly EXCLUDES unpublished sessions.
        wave3_attempts = 0
        wave3_titles = [
            "Operating Systems - Applied Midterm",
            "Computer Networks - Security Quiz",
        ]
        for blueprint_index, title in enumerate(wave3_titles):
            blueprint = blueprints[title]
            slugs = BULK_BLUEPRINT_ITEMS[title]
            course_code = bulk_course_for_blueprint.get(title, "CS-101")
            duration = blueprint.duration_minutes or 30
            run_starts_at = now - timedelta(days=2 - blueprint_index, hours=11)
            run_ends_at = run_starts_at + timedelta(minutes=duration)
            run = ScheduledExamSession(
                course_id=courses[course_code].id,
                test_definition_id=blueprint.id,
                created_by=constructor.id,
                starts_at=run_starts_at,
                ends_at=run_ends_at,
                status=CourseSessionStatus.CLOSED,
                duration_minutes_override=duration,
            )
            db.add(run)
            db.flush()
            for student_index, (analytics_student, ability) in enumerate(analytics_students[:6]):
                started_at = run.starts_at + timedelta(seconds=student_index * 17 % 180)
                rng = _stable_random(analytics_student.email, "wave3-submit", title)
                submitted_at = _realistic_submission(started_at, duration, ability, rng)
                create_bulk_attempt(
                    db,
                    blueprint=blueprint,
                    student=analytics_student,
                    grader=constructor,
                    publisher=admin,
                    item_versions_for_attempt=item_versions_v2,
                    item_slugs=slugs,
                    ability=ability,
                    started_at=started_at,
                    submitted_at=submitted_at,
                    published=False,
                    wave="v3",
                    scheduled_session_id=run.id,
                    grade_essays=False,
                )
                wave3_attempts += 1

        # ── No-show CLOSED run: zero submissions. Validates the picker's
        # "0 submitted / not gradable" empty-row affordance.
        empty_run_blueprint = blueprints["Database Systems - SQL Quiz"]
        empty_run_duration = empty_run_blueprint.duration_minutes or 50
        empty_run_starts = now - timedelta(days=4, hours=9)
        db.add(
            ScheduledExamSession(
                course_id=courses["CS-101"].id,  # cross-listed re-sit, nobody showed
                test_definition_id=empty_run_blueprint.id,
                created_by=constructor.id,
                starts_at=empty_run_starts,
                ends_at=empty_run_starts + timedelta(minutes=empty_run_duration),
                status=CourseSessionStatus.CLOSED,
                duration_minutes_override=empty_run_duration,
            )
        )

        # ── Realism cohorts: IN_PROGRESS + EXPIRED sessions on a real ongoing
        # scheduled run + a recent CLOSED run, so the grading/analytics filters
        # (status="SUBMITTED", is_published=True) are visibly doing their job.
        #
        # We use the Programming Foundations - Intro Midterm blueprint because
        # it has rich content + is already mapped to CS-101. One brand-new
        # ONGOING run (started 5 min ago, 60-min duration) holds 2 STARTED
        # sessions; the most-recent wave-1 CLOSED run picks up 2 EXPIRED ones.
        ongoing_blueprint = blueprints["Programming Foundations - Intro Midterm"]
        ongoing_run = ScheduledExamSession(
            course_id=courses["CS-101"].id,
            test_definition_id=ongoing_blueprint.id,
            created_by=constructor.id,
            starts_at=now - timedelta(minutes=5),
            ends_at=now + timedelta(minutes=55),
            status=CourseSessionStatus.SCHEDULED,
            duration_minutes_override=ongoing_blueprint.duration_minutes,
        )
        db.add(ongoing_run)
        db.flush()
        intro_slugs = BULK_BLUEPRINT_ITEMS["Programming Foundations - Intro Midterm"]
        intro_snapshots = [build_item_snapshot(item_versions[s]) for s in intro_slugs]
        for live_student in (alex, maya):
            db.add(
                ExamSession(
                    test_definition_id=ongoing_blueprint.id,
                    student_id=live_student.id,
                    scheduled_session_id=ongoing_run.id,
                    items=intro_snapshots,
                    status=SessionStatus.STARTED,
                    session_mode=ExamSessionMode.ASSIGNED,
                    started_at=now - timedelta(minutes=3),
                    submitted_at=None,
                    expires_at=ongoing_run.ends_at,
                )
            )

        intro_wave1_run = wave1_runs["Programming Foundations - Intro Midterm"]
        for ditched_student in (noor, liam):
            db.add(
                ExamSession(
                    test_definition_id=ongoing_blueprint.id,
                    student_id=ditched_student.id,
                    scheduled_session_id=intro_wave1_run.id,
                    items=intro_snapshots,
                    status=SessionStatus.EXPIRED,
                    session_mode=ExamSessionMode.ASSIGNED,
                    started_at=intro_wave1_run.starts_at,
                    submitted_at=None,
                    expires_at=intro_wave1_run.ends_at,
                )
            )

        db.commit()

        print(
            f"Seeded {len(QUESTION_CATALOG)} course-linked questions across "
            f"{len(COURSE_SPECS)} curriculum courses."
        )
        print(
            f"Created {len(blueprint_specs)} blueprints and 2 closed runs of "
            "CS 202 Final for the per-run grading/analytics picker."
        )
        print("Inserted completed grading data with published results for seeded demo students.")
        print(
            f"Analytics: {len(analytics_students)} extra students, "
            f"{wave1_attempts} v1 attempts (CLOSED runs), "
            f"{wave2_attempts} v2 attempts (re-sit CLOSED runs), "
            f"{wave3_attempts} v3 ungraded attempts (PARTIALLY_GRADED, unpublished). "
            f"Each bulk blueprint now has its own scheduled CLOSED run on its "
            f"natural course — per-run picker and combined analytics agree."
        )
        print(
            "Realism cohorts: 1 ONGOING run on Programming Foundations - Intro Midterm "
            "with 2 IN_PROGRESS sessions, 2 EXPIRED sessions on the wave-1 CLOSED run, "
            "1 no-show CLOSED run with zero submissions. These prove grading/analytics "
            "filters (status=SUBMITTED, is_published=True) are doing their job."
        )

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
