import pytest
from app.modules.agent.nodes import propose_action


@pytest.mark.asyncio
async def test_propose_action_includes_idempotency_key(monkeypatch):
    """The proposal carries a server-generated idempotency key so the confirm is bound to it."""
    from app.modules.agent import nodes

    class _FakeProposal:
        enough_info = True
        name = "Groceries"
        amount = 40.0
        category = "Groceries"
        date = None
        clarification = None

    class _FakeLLM:
        def with_structured_output(self, _):
            return self
        async def ainvoke(self, _msgs):
            return _FakeProposal()

    monkeypatch.setattr(nodes, "get_route_llm", lambda: _FakeLLM())
    out = await propose_action({"question": "add a $40 groceries expense", "history": [],
                                "steps": []})
    pa = out["proposed_action"]
    assert pa["action_type"] == "create_expense"
    assert isinstance(pa.get("idempotency_key"), str) and len(pa["idempotency_key"]) >= 8
