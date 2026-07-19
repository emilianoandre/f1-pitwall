"""Port of apps/ingest/src/feed/connect.ts's negotiate() — HTTP handshake
that precedes the SignalR WebSocket connection.
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

from .auth import USER_AGENT, get_access_token, get_entitlement_cookie
from .topics import NEGOTIATE_URL, ORIGIN, REFERER


@dataclass
class Negotiation:
    connection_token: str
    cookie: str | None
    access_token: str


def negotiate() -> Negotiation:
    """Step 1: get an F1TV access token, then negotiate a connection over HTTP."""
    access_token = get_access_token()
    entitlement_cookie = get_entitlement_cookie()

    # AWS ALB session-stickiness cookie, so negotiate and the websocket that
    # follows land on the same backend node.
    pre = requests.options(
        NEGOTIATE_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Origin": ORIGIN,
            "Referer": REFERER,
            **({"Cookie": entitlement_cookie} if entitlement_cookie else {}),
        },
        timeout=15,
    )
    alb_value = pre.cookies.get("AWSALBCORS")
    alb_cookie = f"AWSALBCORS={alb_value}" if alb_value else None
    cookie = _join_cookies(alb_cookie, entitlement_cookie)

    # A real browser's negotiate call carries no Authorization header at all —
    # it authenticates via cookies from an actual formula1.com login session
    # that we mostly don't have. We keep sending our own bearer token here
    # since it's the only auth we have for everything but the entitlement
    # cookie above, and negotiate already succeeds with it; the
    # ?negotiateVersion= query param is dropped to match the real trace.
    res = requests.post(
        NEGOTIATE_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Origin": ORIGIN,
            "Referer": REFERER,
            "Authorization": f"Bearer {access_token}",
            **({"Cookie": cookie} if cookie else {}),
        },
        timeout=15,
    )

    raw_text = res.text
    if res.status_code != 200:
        detail = raw_text[:300].replace("\n", " ").strip()
        raise RuntimeError(f"negotiate failed: HTTP {res.status_code}" + (f" — {detail}" if detail else ""))

    body = res.json()
    connection_token = body.get("connectionToken") or body.get("connectionId")
    if not connection_token:
        raise RuntimeError("negotiate response missing connection token")

    return Negotiation(connection_token=connection_token, cookie=cookie, access_token=access_token)


def _join_cookies(*pairs: str | None) -> str | None:
    present = [p for p in pairs if p]
    return "; ".join(present) if present else None
