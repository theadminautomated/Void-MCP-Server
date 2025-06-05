import sys
from types import SimpleNamespace
from pathlib import Path
import start


def test_main_invokes_all(monkeypatch, tmp_path):
    calls = []

    def fake_check_call(cmd, **kwargs):
        calls.append(cmd)

    def fake_popen(cmd, **kwargs):
        calls.append(cmd)
        class P:
            pid = 123
            def wait(self):
                pass
            def kill(self):
                pass
        return P()

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(start.subprocess, "check_call", fake_check_call)
    monkeypatch.setattr(start.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(sys, "argv", ["start.py", "--model", "m", "--port", "1", "--model-port", "2"])

    start.main()

    assert ["npm", "install", "--silent"] in calls
    assert ["npm", "run", "build", "--silent"] in calls
    assert [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"] in calls
    assert ["node", "dist/index.js"] in calls
    assert [sys.executable, "run_local.py", "--model", "m", "--port", "2"] in calls
