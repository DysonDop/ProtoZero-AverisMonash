import pytest

from pipeline.circuit_breaker import CircuitBreaker, CircuitOpenError


def test_circuit_breaker_opens_and_skips_calls() -> None:
    breaker = CircuitBreaker(failure_threshold=2)
    calls = 0

    def fail() -> None:
        nonlocal calls
        calls += 1
        raise ConnectionError("network unavailable")

    for _ in range(2):
        with pytest.raises(ConnectionError):
            breaker.call(
                fail,
                correlation_id="test-correlation",
                service="classifier",
            )

    assert breaker.state == "open"
    assert breaker.failures == 2
    with pytest.raises(CircuitOpenError):
        breaker.call(
            fail,
            correlation_id="test-correlation",
            service="classifier",
        )
    assert calls == 2


def test_half_open_probe_closes_after_success() -> None:
    breaker = CircuitBreaker(failure_threshold=1)
    with pytest.raises(RuntimeError):
        breaker.call(
            lambda: (_ for _ in ()).throw(RuntimeError("offline")),
            correlation_id="test-correlation",
            service="extraction",
        )

    assert breaker.begin_probe()
    assert breaker.state == "half_open"
    assert breaker.call(
        lambda: "ok",
        correlation_id="test-correlation",
        service="extraction",
    ) == "ok"
    assert breaker.state == "closed"
    assert breaker.failures == 0
