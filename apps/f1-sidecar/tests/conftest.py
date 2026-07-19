import base64
import json
import time

import pytest

from f1_sidecar import auth as auth_module


@pytest.fixture(autouse=True)
def _reset_auth_cache():
    auth_module.reset_auth_cache_for_tests()
    yield
    auth_module.reset_auth_cache_for_tests()


def make_jwt(exp_seconds_from_now: float = 3600) -> str:
    """Build a syntactically valid (unsigned) JWT with an exp claim, for
    tests that only need the token shape/expiry to be realistic."""
    header = _b64({"alg": "RS256", "typ": "JWT"})
    payload = _b64({"exp": int(time.time() + exp_seconds_from_now)})
    return f"{header}.{payload}.signature"


def _b64(obj: dict) -> str:
    raw = json.dumps(obj).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
