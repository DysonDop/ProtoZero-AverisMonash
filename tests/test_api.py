from fastapi.testclient import TestClient

from api.main import app


def test_live_frontend_contract() -> None:
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["cases"] > 0

        info = client.get("/api")
        assert info.status_code == 200
        assert info.json()["cases_loaded"] == 520

        second_page = client.get("/api/cases?limit=500&offset=500")
        assert second_page.status_code == 200
        assert len(second_page.json()["items"]) == 20

        case = client.get("/api/cases/email_004")
        assert case.status_code == 200
        assert case.json()["comparisons"]

        evidence = client.get("/api/cases/email_004/document/SI")
        assert evidence.status_code == 200
        assert evidence.json()["text"]

        events = client.get("/api/cases/email_004/events")
        assert events.status_code == 200
        assert events.json()["items"]
        assert events.json()["items"] == sorted(
            events.json()["items"], key=lambda event: event["seq"]
        )

        decision = {
            "action": "reject",
            "label": "Reject the draft",
            "done": "Draft rejected.",
            "reviewer_id": "api-test",
        }
        saved = client.post("/api/cases/email_004/decision", json=decision)
        assert saved.status_code == 200
        assert saved.json()["decision"]["action"] == "reject"
        assert client.get("/api/cases/email_004/decision").json()["decision"] is not None

        removed = client.delete("/api/cases/email_004/decision?reviewer_id=api-test")
        assert removed.status_code == 200
        assert client.get("/api/cases/email_004/decision").json()["decision"] is None

        handoff = client.post(
            "/api/cases/email_004/decision",
            json={
                "action": "review",
                "label": "Send to a person",
                "done": "Sent to a person.",
                "reviewer_id": "api-test",
            },
        )
        assert handoff.status_code == 200
        queue = client.get("/api/review").json()["items"]
        assert any(item["id"] == "email_004:manual" for item in queue)
        client.delete("/api/cases/email_004/decision?reviewer_id=api-test")
        queue = client.get("/api/review").json()["items"]
        assert all(item["id"] != "email_004:manual" for item in queue)


def test_review_actions_update_queue_and_audit() -> None:
    with TestClient(app) as client:
        queue = client.get("/api/review").json()["items"]
        assert queue

        retry_item = next(
            item
            for item in queue
            if item["reason"] in {"UNREADABLE_DOCUMENT", "GROUNDING_FAILED", "PROCESSING_ERROR"}
        )
        retried = client.post(
            f"/api/review/{retry_item['id']}/retry", json={"force_llm": False}
        )
        assert retried.status_code == 200
        retry_events = client.get(
            f"/api/cases/{retry_item['email_id']}/events"
        ).json()["items"]
        assert any(event["action"] == "COMPARISON_RERUN" for event in retry_events)

        queue = client.get("/api/review").json()["items"]
        item = queue[0]

        resolved = client.post(
            f"/api/review/{item['id']}/resolve",
            json={
                "action": "confirm",
                "field": item["fields"][0] if item["fields"] else None,
                "correct_value": None,
                "reviewer_id": "api-test",
            },
        )
        assert resolved.status_code == 200
        assert resolved.json()["review_item"]["state"] == "resolved"

        events = client.get(f"/api/cases/{item['email_id']}/events").json()["items"]
        assert any(event["action"] == "HUMAN_CORRECTION" for event in events)
