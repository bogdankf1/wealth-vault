"""Guard the Celery worker import path.

`app.tasks.__init__` imports `base` then every task module — the same chain the worker/beat
process runs. A missing model-registration side-effect import in `app/tasks/base.py` makes this
fail with a circular ImportError (regression caught in CI review 2026-06-28). Importing the
package here is a cheap, key-free guard; nothing else in the suite exercises `app.tasks.*`.
"""


def test_tasks_package_imports():
    import app.tasks  # noqa: F401

    # A representative task module must be importable (the worker would import all of them).
    assert app.tasks.income_tasks is not None
    assert app.tasks.notification_tasks is not None
