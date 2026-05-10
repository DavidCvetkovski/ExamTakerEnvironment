import pytest

# Pure sync no-op override — unit tests have no DB dependency.
@pytest.fixture(scope="session", autouse=True)
def initialize_prisma():
    yield
