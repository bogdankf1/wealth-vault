"""
Eval-coverage meta-check — no DB, no API key, pure static analysis.

Enforces that every agent WRITE ACTION (app.modules.agent.actions.ACTION_REGISTRY) is
referenced by at least one eval case, so a new Level-D action can't merge without a test.
The action_type string is what eval assertions key on (e.g. proposed_action.action_type ==
"create_expense"), so a substring check across the eval files is a faithful coverage proxy.

(Runtime compute-tool coverage — asserting every TOOLS entry is exercised — needs the LLM and
belongs in the key-bearing agent-evals workflow; tracked separately. This gate stays cheap.)

Run from backend/:  python evals/check_coverage.py
"""
import ast
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parent.parent
ACTIONS_FILE = BACKEND / "app" / "modules" / "agent" / "actions.py"
EVAL_FILES = [
    BACKEND / "evals" / "run_eval_assertions.py",
    BACKEND / "evals" / "promptfooconfig.yaml",
]


def action_types() -> list[str]:
    """String keys of the ACTION_REGISTRY dict literal, read via AST (no app import / no deps)."""
    tree = ast.parse(ACTIONS_FILE.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "ACTION_REGISTRY" for t in node.targets
        ):
            if isinstance(node.value, ast.Dict):
                return [k.value for k in node.value.keys
                        if isinstance(k, ast.Constant) and isinstance(k.value, str)]
    return []


def main() -> int:
    actions = action_types()
    if not actions:
        print("✗ could not find ACTION_REGISTRY keys in actions.py", file=sys.stderr)
        return 1

    eval_text = "\n".join(f.read_text() for f in EVAL_FILES if f.exists())
    missing = [a for a in actions if a not in eval_text]

    for a in actions:
        print(f"  {'✗' if a in missing else '✓'} {a}")

    if missing:
        print(
            f"\n✗ {len(missing)} action(s) lack an eval case: {', '.join(missing)}\n"
            f"  Add a case referencing the action_type to evals/run_eval_assertions.py "
            f"and evals/promptfooconfig.yaml.",
            file=sys.stderr,
        )
        return 1

    print(f"\n✓ all {len(actions)} agent action(s) have eval coverage")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
