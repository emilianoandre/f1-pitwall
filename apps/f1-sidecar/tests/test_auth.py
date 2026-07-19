import pytest
import responses

from f1_sidecar import auth
from tests.conftest import make_jwt


def test_has_f1tv_credentials_false_when_unset(monkeypatch):
    monkeypatch.delenv("F1_SUBSCRIPTION_TOKEN", raising=False)
    monkeypatch.delenv("F1_USERNAME", raising=False)
    monkeypatch.delenv("F1_PASSWORD", raising=False)
    assert auth.has_f1tv_credentials() is False


def test_has_f1tv_credentials_true_with_subscription_token(monkeypatch):
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", "x.y.z")
    assert auth.has_f1tv_credentials() is True


def test_has_f1tv_credentials_true_with_username_password(monkeypatch):
    monkeypatch.delenv("F1_SUBSCRIPTION_TOKEN", raising=False)
    monkeypatch.setenv("F1_USERNAME", "u")
    monkeypatch.setenv("F1_PASSWORD", "p")
    assert auth.has_f1tv_credentials() is True


def test_manual_token_is_sanitized_and_cached(monkeypatch):
    token = make_jwt()
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", f"  {token}\n")
    result = auth.get_access_token()
    assert result == token


def test_manual_token_rejects_non_jwt(monkeypatch):
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", "not-a-jwt")
    with pytest.raises(ValueError, match="doesn't look like a valid JWT"):
        auth.get_access_token()


def test_manual_token_rejects_expired(monkeypatch):
    token = make_jwt(exp_seconds_from_now=-10)
    monkeypatch.setenv("F1_SUBSCRIPTION_TOKEN", token)
    with pytest.raises(ValueError, match="expired"):
        auth.get_access_token()


def test_login_requires_username_and_password(monkeypatch):
    monkeypatch.delenv("F1_SUBSCRIPTION_TOKEN", raising=False)
    monkeypatch.delenv("F1_USERNAME", raising=False)
    monkeypatch.delenv("F1_PASSWORD", raising=False)
    with pytest.raises(ValueError, match="F1_USERNAME/F1_PASSWORD"):
        auth.get_access_token()


@responses.activate
def test_login_success(monkeypatch):
    monkeypatch.delenv("F1_SUBSCRIPTION_TOKEN", raising=False)
    monkeypatch.setenv("F1_USERNAME", "user@example.com")
    monkeypatch.setenv("F1_PASSWORD", "hunter2")
    token = make_jwt()
    responses.add(
        responses.POST,
        auth.AUTH_URL,
        json={"data": {"subscriptionToken": token}},
        status=200,
    )
    result = auth.get_access_token()
    assert result == token


@responses.activate
def test_login_failure_surfaces_detail(monkeypatch):
    monkeypatch.delenv("F1_SUBSCRIPTION_TOKEN", raising=False)
    monkeypatch.setenv("F1_USERNAME", "user@example.com")
    monkeypatch.setenv("F1_PASSWORD", "wrong")
    responses.add(
        responses.POST,
        auth.AUTH_URL,
        json={"message": "invalid credentials"},
        status=401,
    )
    with pytest.raises(RuntimeError, match="invalid credentials"):
        auth.get_access_token()


def test_entitlement_cookie_absent_when_unset(monkeypatch):
    monkeypatch.delenv("F1_ENTITLEMENT_TOKEN", raising=False)
    assert auth.get_entitlement_cookie() is None


def test_entitlement_cookie_present_when_set(monkeypatch):
    monkeypatch.setenv("F1_ENTITLEMENT_TOKEN", " abc123 ")
    assert auth.get_entitlement_cookie() == "entitlement_token=abc123"
