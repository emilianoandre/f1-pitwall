import pytest
import responses

from f1_sidecar import negotiate as negotiate_module
from f1_sidecar.topics import NEGOTIATE_URL
from tests.conftest import make_jwt


@responses.activate
def test_negotiate_returns_connection_token_and_joined_cookies(monkeypatch):
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", make_jwt())
    monkeypatch.setenv("F1_ENTITLEMENT_TOKEN", "ent-abc")

    responses.add(
        responses.OPTIONS,
        NEGOTIATE_URL,
        status=200,
        headers={"Set-Cookie": "AWSALBCORS=sticky123; Path=/; Secure"},
    )
    responses.add(
        responses.POST,
        NEGOTIATE_URL,
        json={"connectionToken": "conn-xyz"},
        status=200,
    )

    result = negotiate_module.negotiate()

    assert result.connection_token == "conn-xyz"
    assert "AWSALBCORS=sticky123" in result.cookie
    assert "entitlement_token=ent-abc" in result.cookie


@responses.activate
def test_negotiate_accepts_connection_id_fallback(monkeypatch):
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", make_jwt())

    responses.add(responses.OPTIONS, NEGOTIATE_URL, status=200)
    responses.add(responses.POST, NEGOTIATE_URL, json={"connectionId": "conn-fallback"}, status=200)

    result = negotiate_module.negotiate()
    assert result.connection_token == "conn-fallback"
    assert result.cookie is None


@responses.activate
def test_negotiate_raises_on_non_200(monkeypatch):
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", make_jwt())

    responses.add(responses.OPTIONS, NEGOTIATE_URL, status=200)
    responses.add(responses.POST, NEGOTIATE_URL, body="Pardon Our Interruption", status=403)

    with pytest.raises(RuntimeError, match="negotiate failed: HTTP 403"):
        negotiate_module.negotiate()


@responses.activate
def test_negotiate_raises_when_token_missing(monkeypatch):
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", make_jwt())

    responses.add(responses.OPTIONS, NEGOTIATE_URL, status=200)
    responses.add(responses.POST, NEGOTIATE_URL, json={}, status=200)

    with pytest.raises(RuntimeError, match="missing connection token"):
        negotiate_module.negotiate()
