from app.modules.agent.nodes import _with_projection_disclaimer, PROJECTION_DISCLAIMER


def test_appends_disclaimer_when_projection_flag_present():
    out = _with_projection_disclaimer(
        "Your savings could grow to $24,470.56.",
        {"results": [{"tool": "savings_projection", "projection": True}]},
    )
    assert out.endswith(PROJECTION_DISCLAIMER)
    assert "$24,470.56" in out


def test_no_disclaimer_without_projection_flag():
    draft = "Your savings total $23,820.50."
    out = _with_projection_disclaimer(draft, {"results": [{"tool": "savings_summary"}]})
    assert out == draft


def test_idempotent_when_already_present():
    draft = "Projected.\n\n" + PROJECTION_DISCLAIMER
    out = _with_projection_disclaimer(draft, {"results": [{"projection": True}]})
    assert out.count(PROJECTION_DISCLAIMER) == 1


def test_handles_missing_computed():
    assert _with_projection_disclaimer("hi", None) == "hi"
