from f1_sidecar.upstream import RECORD_SEPARATOR, _backoff_delay, is_completion_frame


def test_is_completion_frame_true_for_subscribe_reply():
    frame = '{"type":3,"result":{"CarData.z":"...","Heartbeat":{}}}' + RECORD_SEPARATOR
    assert is_completion_frame(frame) is True


def test_is_completion_frame_false_for_invocation():
    frame = '{"type":1,"target":"feed","arguments":[["Heartbeat",{},"2026-01-01T00:00:00Z"]]}' + RECORD_SEPARATOR
    assert is_completion_frame(frame) is False


def test_is_completion_frame_false_for_garbage():
    assert is_completion_frame("not json" + RECORD_SEPARATOR) is False


def test_backoff_delay_is_monotonically_bounded():
    delays = [_backoff_delay(n) for n in range(1, 10)]
    assert delays[0] >= 1.0
    assert all(d <= 30.0 * 1.25 for d in delays)  # base * 2**n capped at MAX, plus jitter
    assert delays[-1] > delays[0]
