import argparse
import os
import subprocess
import sys
from pathlib import Path


def ensure_node_deps() -> None:
    """Install Node dependencies if node_modules missing."""
    if not Path("node_modules").exists():
        subprocess.check_call(["npm", "install", "--silent"])


def ensure_python_deps() -> None:
    """Install Python dependencies from requirements.txt."""
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
    )


def ensure_build() -> None:
    """Build TypeScript project if dist directory is missing."""
    if not Path("dist").exists():
        subprocess.check_call(["npm", "run", "build", "--silent"])


def start_servers(model: str, node_port: int, model_port: int) -> None:
    """Launch MCP server and local model server."""
    env = os.environ.copy()
    env.setdefault("PORT", str(node_port))
    node_proc = subprocess.Popen(["node", "dist/index.js"], env=env)
    model_proc = subprocess.Popen(
        [
            sys.executable,
            "run_local.py",
            "--model",
            model,
            "--port",
            str(model_port),
        ]
    )

    print(f"MCP Server running on http://localhost:{node_port}")
    print(f"Local model server running on http://localhost:{model_port}")
    print(f"Server PIDs: MCP={node_proc.pid}, MODEL={model_proc.pid}")
    print("Press Ctrl+C to stop both processes.")

    try:
        node_proc.wait()
        model_proc.wait()
    finally:
        node_proc.kill()
        model_proc.kill()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="One-click launcher for MCP server and local model"
    )
    parser.add_argument("--model", default="sshleifer/tiny-gpt2")
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--model-port", type=int, default=8000)
    args = parser.parse_args(argv)

    ensure_node_deps()
    ensure_python_deps()
    ensure_build()
    start_servers(args.model, args.port, args.model_port)


if __name__ == "__main__":
    main()
