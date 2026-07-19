"""F1TV token handling — a direct port of apps/ingest/src/feed/auth.ts.

F1_USERNAME/F1_PASSWORD log in programmatically. On Node this gets blocked by
Akamai bot detection from most cloud hosts (see feed/auth.ts) — but that
block may be keyed on the same TLS/client fingerprint that silently withheld
CarData.z/Position.z from our Node WebSocket client (see upstream.py's
module docstring). Since this service runs on Railway with Python's
requests/urllib3+OpenSSL stack rather than Node's, it's worth trying
F1_USERNAME/F1_PASSWORD here even though the equivalent Node login never
worked from a cloud IP — it may just get through. F1_SUBSCRIPTION_TOKEN
(manually captured from a browser) remains the fallback if it doesn't.
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from dataclasses import dataclass
from threading import Lock

import requests

AUTH_URL = "https://api.formula1.com/v2/account/subscriber/authenticate/by-password"
# Public client API key used by open-source F1TV clients (f1viewer, MultiViewer).
# Not a secret — it identifies the client application, not the account.
API_KEY = "fCUCjWrKPu9ylJwRAv8BpGLEgiAuThx7"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_TOKEN_RE = re.compile(r"[^A-Za-z0-9_.\-]")


@dataclass
class _CachedToken:
    token: str
    expires_at_ms: float


_cached: _CachedToken | None = None
_lock = Lock()


def has_f1tv_credentials() -> bool:
    """True if some way of getting an F1TV token is configured."""
    return bool(
        os.environ.get("F1_SUBSCRIPTION_TOKEN")
        or (os.environ.get("F1_USERNAME") and os.environ.get("F1_PASSWORD"))
    )


def get_access_token() -> str:
    """Get a cached F1TV subscription token, refreshing if needed.

    Mirrors feed/auth.ts's getAccessToken(): a manually-provided
    F1_SUBSCRIPTION_TOKEN takes priority if set, otherwise a fresh
    username/password login.
    """
    global _cached
    with _lock:
        if _cached and _cached.expires_at_ms > _now_ms() + 60_000:
            return _cached.token
        manual = os.environ.get("F1_SUBSCRIPTION_TOKEN")
        token = _use_manual_token(manual) if manual else _login()
        return token


def _sanitize_token(raw: str) -> str:
    """Strip anything that isn't a valid JWT character (quotes, whitespace,
    a trailing newline from copy-paste) so a slightly messy paste into an
    env var doesn't break things."""
    return _TOKEN_RE.sub("", raw)


def _use_manual_token(raw_token: str) -> str:
    global _cached
    token = _sanitize_token(raw_token)
    if not token or len(token.split(".")) != 3:
        raise ValueError(
            "F1_SUBSCRIPTION_TOKEN doesn't look like a valid JWT after removing "
            "whitespace/quotes — make sure you pasted only the subscriptionToken "
            "value, not the whole JSON response"
        )
    expires_at_ms = _expiry_from_jwt(token)
    if expires_at_ms <= _now_ms():
        raise ValueError(
            "F1_SUBSCRIPTION_TOKEN has expired — log into F1TV in a browser again "
            "and set a fresh one (a manually-obtained token can't be auto-renewed)"
        )
    _cached = _CachedToken(token=token, expires_at_ms=expires_at_ms)
    return token


def _login() -> str:
    global _cached
    username = os.environ.get("F1_USERNAME")
    password = os.environ.get("F1_PASSWORD")
    if not username or not password:
        raise ValueError(
            "F1_USERNAME/F1_PASSWORD are not set — the live timing feed requires "
            "an F1TV login"
        )

    resp = requests.post(
        AUTH_URL,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "apiKey": API_KEY,
            "User-Agent": USER_AGENT,
        },
        json={"Login": username, "Password": password},
        timeout=15,
    )

    raw_text = resp.text
    parsed = None
    try:
        parsed = resp.json()
    except ValueError:
        pass  # not JSON — likely a block page or plain-text error, fall through

    token = (parsed or {}).get("data", {}).get("subscriptionToken")
    if resp.status_code != 200 or not token:
        server = resp.headers.get("server") or (
            "akamai" if resp.headers.get("x-akamai-request-id") else None
        )
        detail = (parsed or {}).get("message") or re.sub(r"\s+", " ", raw_text[:300]).strip()
        raise RuntimeError(
            f"F1TV login failed: HTTP {resp.status_code}"
            + (f" (server: {server})" if server else "")
            + (f" — {detail}" if detail else "")
        )

    expires_at_ms = _expiry_from_jwt(token)
    _cached = _CachedToken(token=token, expires_at_ms=expires_at_ms)
    return token


def get_entitlement_cookie() -> str | None:
    """F1TV's entitlement_token cookie — see feed/auth.ts for context."""
    raw = os.environ.get("F1_ENTITLEMENT_TOKEN")
    if not raw:
        return None
    token = _sanitize_token(raw)
    return f"entitlement_token={token}" if token else None


def _expiry_from_jwt(token: str) -> float:
    """Read the exp claim out of the JWT — we trust our own login response."""
    try:
        payload_b64 = token.split(".")[1]
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        exp = payload.get("exp")
        if isinstance(exp, (int, float)):
            return exp * 1000
    except Exception:
        pass
    return _now_ms() + 6 * 24 * 60 * 60 * 1000  # default: refresh after 6 days


def _now_ms() -> float:
    return time.time() * 1000


def reset_auth_cache_for_tests() -> None:
    global _cached
    _cached = None
