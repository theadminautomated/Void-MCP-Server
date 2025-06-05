import json
from pathlib import Path


def test_example_config_valid():
    path = Path("ide_config.example.json")
    data = json.loads(path.read_text())
    assert "context_servers" in data
    name, server = next(iter(data["context_servers"].items()))
    command = server["command"]
    assert command["path"] == "python"
    assert command["args"] and command["args"][0].endswith("start.py")
