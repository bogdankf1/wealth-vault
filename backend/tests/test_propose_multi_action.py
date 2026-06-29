import pytest
from app.modules.agent import nodes
from app.modules.agent.nodes import propose_action


def _patch(monkeypatch, **fields):
    class _P:
        enough_info = True
        action_type = "create_expense"
        name = None; amount = None; target_amount = None
        category = None; frequency = None; date = None; clarification = None
    for k, v in fields.items():
        setattr(_P, k, v)

    class _LLM:
        def with_structured_output(self, _): return self
        async def ainvoke(self, _msgs): return _P()
    monkeypatch.setattr(nodes, "get_route_llm", lambda: _LLM())


@pytest.mark.asyncio
async def test_propose_income(monkeypatch):
    _patch(monkeypatch, action_type="create_income", amount=2000.0, category="Freelance")
    out = await propose_action({"question": "log $2000 freelance income", "history": [], "steps": []})
    pa = out["proposed_action"]
    assert pa["action_type"] == "create_income" and pa["args"]["amount"] == 2000.0
    assert isinstance(pa["idempotency_key"], str) and pa["summary"]


@pytest.mark.asyncio
async def test_propose_subscription(monkeypatch):
    _patch(monkeypatch, action_type="create_subscription", name="Netflix", amount=15.0,
           frequency="monthly")
    out = await propose_action({"question": "add a $15/mo Netflix subscription", "history": [],
                                "steps": []})
    assert out["proposed_action"]["action_type"] == "create_subscription"


@pytest.mark.asyncio
async def test_propose_goal(monkeypatch):
    _patch(monkeypatch, action_type="create_goal", name="Emergency Fund", target_amount=10000.0)
    out = await propose_action({"question": "set a $10k emergency fund goal", "history": [],
                                "steps": []})
    assert out["proposed_action"]["action_type"] == "create_goal"
    assert out["proposed_action"]["args"]["target_amount"] == 10000.0


@pytest.mark.asyncio
async def test_propose_missing_fields_clarifies(monkeypatch):
    _patch(monkeypatch, action_type="create_goal", name=None, target_amount=None,
           clarification="What's the goal name and target?")
    out = await propose_action({"question": "set a goal", "history": [], "steps": []})
    assert out["proposed_action"] is None and not out["refused"]
