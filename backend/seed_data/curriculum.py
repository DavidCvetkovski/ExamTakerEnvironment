"""Course catalog and topic pools for the e2e curriculum seed."""

COURSE_SPECS = [
    ("CS-101", "Programming Foundations"),
    ("DM-120", "Discrete Mathematics"),
    ("RM-210", "Research Methods"),
    ("WEB-240", "Web Application Development"),
    ("HCI-260", "Human-Computer Interaction"),
    ("CS-202", "Data Structures and Algorithms"),
    ("CS-301", "Operating Systems"),
    ("CS-305", "Database Systems"),
    ("SWE-330", "Software Engineering"),
    ("CS-350", "Computer Networks"),
    ("SEC-360", "Security Engineering"),
    ("ML-410", "Machine Learning"),
]


COURSE_TOPICS = {
    "CS-101": ["Variables and Types", "Control Flow", "Functions", "Basic Complexity"],
    "DM-120": ["Logic", "Proof Techniques", "Combinatorics", "Graphs"],
    "RM-210": ["Study Design", "Sampling", "Validity", "Ethics"],
    "WEB-240": ["HTTP", "React State", "Forms", "Accessibility"],
    "HCI-260": ["Usability", "Interaction Design", "Evaluation", "Visual Hierarchy"],
    "CS-202": ["Trees", "Hashing", "Graphs", "Dynamic Programming"],
    "CS-301": ["Processes", "Scheduling", "Memory", "Concurrency"],
    "CS-305": ["SQL", "Normalisation", "Transactions", "Indexing"],
    "SWE-330": ["Testing", "Design Principles", "Version Control", "Architecture"],
    "CS-350": ["Transport", "DNS", "Routing", "TLS"],
    "SEC-360": ["Authentication", "Web Security", "Threat Modelling", "Secrets"],
    "ML-410": ["Supervised Learning", "Optimisation", "Evaluation", "Bias"],
}


POOL_COURSE_MAP = {
    "algorithms_pool": "CS-202",
    "datastructures_pool": "CS-202",
    "os_pool": "CS-301",
    "databases_pool": "CS-305",
    "networking_pool": "CS-350",
    "security_pool": "SEC-360",
    "ml_pool": "ML-410",
    "swe_pool": "SWE-330",
    "essay_pool": "RM-210",
    "multiple_response_pool": "DM-120",
}

