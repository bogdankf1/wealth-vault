import pytest
from app.modules.agent import nodes
from app.modules.agent.nodes import propose_action


def _patch_llm(monkeypatch, **fields):
    class _P:
        enough_info = True
        action_type = "update_expense"
        name = amount = target_amount = category = frequency = date = None
        match_text = match_amount = new_name = new_amount = new_category = clarification = None
    for k, v in fields.items():
        setattr(_P, k, v)

    class _LLM:
        def with_structured_output(self, _): return self
        async def ainvoke(self, _msgs): return _P()
    monkeypatch.setattr(nodes, "get_route_llm", lambda: _LLM())


class _Exp:
    def __init__(self, id, name, amount, date=None):
        self.id, self.name, self.amount, self.date, self.category = id, name, amount, date, None


@pytest.mark.asyncio
async def test_update_one_match_proposes(monkeypatch):
    _patch_llm(monkeypatch, action_type="update_expense", match_text="Netflix", new_amount=20.0)
    monkeypatch.setattr(nodes, "_find_expense_candidates",
                        lambda db, uid, text, amt: [_Exp("11111111-1111-1111-1111-111111111111", "Netflix", 15.0)])
    out = await propose_action({"question": "change my Netflix expense to $20", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    pa = out["proposed_action"]
    assert pa["action_type"] == "update_expense"
    assert pa["args"]["expense_id"] == "11111111-1111-1111-1111-111111111111"
    assert pa["args"]["amount"] == 20.0


@pytest.mark.asyncio
async def test_delete_one_match_proposes_with_undo_warning(monkeypatch):
    _patch_llm(monkeypatch, action_type="delete_expense", match_text="coffee")
    monkeypatch.setattr(nodes, "_find_expense_candidates",
                        lambda db, uid, text, amt: [_Exp("22222222-2222-2222-2222-222222222222", "Coffee", 4.5)])
    out = await propose_action({"question": "delete my coffee expense", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    assert out["proposed_action"]["action_type"] == "delete_expense"
    assert "undone" in out["proposed_action"]["summary"].lower()


@pytest.mark.asyncio
async def test_many_matches_disambiguates(monkeypatch):
    _patch_llm(monkeypatch, action_type="delete_expense", match_text="coffee")
    monkeypatch.setattr(nodes, "_find_expense_candidates",
                        lambda db, uid, text, amt: [_Exp("a", "Coffee", 4.5), _Exp("b", "Coffee", 3.75)])
    out = await propose_action({"question": "delete my coffee expense", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    assert out["proposed_action"] is None and not out["refused"]


@pytest.mark.asyncio
async def test_no_match_clarifies(monkeypatch):
    _patch_llm(monkeypatch, action_type="delete_expense", match_text="yacht")
    monkeypatch.setattr(nodes, "_find_expense_candidates", lambda db, uid, text, amt: [])
    out = await propose_action({"question": "delete my yacht expense", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    assert out["proposed_action"] is None
