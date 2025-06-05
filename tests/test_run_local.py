import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # noqa: E402

torch = pytest.importorskip("torch")

from run_local import LocalModelServer  # noqa: E402


def test_generate_text():
    server = LocalModelServer("sshleifer/tiny-gpt2")
    text = server.generate("Hello", max_new_tokens=5)
    assert isinstance(text, str) and len(text) > 0
