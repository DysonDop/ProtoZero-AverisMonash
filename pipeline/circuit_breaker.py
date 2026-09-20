"""Small process-local circuit breaker for optional cloud assistance.

The deterministic pipeline remains available when the breaker is open.  The
wrapper deliberately knows nothing about Azure or any other provider, so every
optional model/document service follows the same failure policy.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from threading import Lock
from typing import Any, Literal

from pipeline.config import AI_FAILURE_THRESHOLD

logger = logging.getLogger("protozero.ai")


class CircuitOpenError(RuntimeError):
    """Raised internally when an optional cloud call is intentionally skipped."""


class CircuitBreaker:
    def __init__(self, failure_threshold: int = AI_FAILURE_THRESHOLD) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        self.failure_threshold = failure_threshold
        self._failures = 0
        self._state: Literal["closed", "open", "half_open"] = "closed"
        self._lock = Lock()

    @property
    def failures(self) -> int:
        with self._lock:
            return self._failures

    @property
    def state(self) -> Literal["closed", "open", "half_open"]:
        with self._lock:
            return self._state

    def call(
        self,
        operation: Callable[..., Any],
        *args: Any,
        correlation_id: str,
        service: str,
        **kwargs: Any,
    ) -> Any:
        with self._lock:
            if self._state == "open":
                logger.warning(
                    "optional cloud call skipped; deterministic-only mode active",
                    extra={"correlation_id": correlation_id, "service": service},
                )
                raise CircuitOpenError(f"{service} circuit is open")

        try:
            result = operation(*args, **kwargs)
        except Exception:
            with self._lock:
                self._failures += 1
                if self._failures >= self.failure_threshold:
                    self._state = "open"
            logger.exception(
                "optional cloud call failed",
                extra={"correlation_id": correlation_id, "service": service},
            )
            raise

        with self._lock:
            self._failures = 0
            self._state = "closed"
        return result

    def begin_probe(self) -> bool:
        """Allow one operator-initiated retry after the circuit has opened."""
        with self._lock:
            if self._state != "open":
                return False
            self._state = "half_open"
            return True

    def reset(self) -> None:
        with self._lock:
            self._failures = 0
            self._state = "closed"

