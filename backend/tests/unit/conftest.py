import pytest

# Pure sync no-op overrides — unit tests have no DB/Redis dependency.
@pytest.fixture(scope="session", autouse=True)
def initialize_prisma():
    yield


@pytest.fixture(scope="session", autouse=True)
def initialize_redis():
    yield
