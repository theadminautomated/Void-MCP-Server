# Void MCP Server

This project provides a Model Context Protocol (MCP) server for managing LLM context data. A small utility `run_local.py` can launch a local Hugging Face model and a Streamlit interface.

## Development

- **Install dependencies**
  - Node: `npm install`
  - Python: `pip install -r requirements.txt`
- **Build**: `npm run build`
- **Tests**: `npm test` for Node, `pytest` for Python
- **Run local model**: `python run_local.py --model sshleifer/tiny-gpt2 --port 8000`
- **Streamlit UI**: `streamlit run app.py`

## One-Click Start

To launch both the MCP server and a local model server in one step, run:

```bash
python start.py
```

The `start.py` script is cross-platform and installs any missing Node and
Python dependencies, builds the TypeScript server if necessary, and then starts
the MCP server alongside the local model server. On Unix-like systems you can
also use `./start.sh`.

The script installs missing Node dependencies, builds the server if needed, and then starts the MCP service alongside the local model server. Connection details are printed to the terminal for easy integration with IDEs and tools.

## IDE Integration

To connect your IDE's context features to the MCP server, provide a configuration file like `ide_config.json` pointing to `start.py` in this repository.

Replace `/path/to/Void-MCP-Server/start.py` with the absolute path on your system:

```json
{
  "context_servers": {
    "my-mcp-server": {
      "command": {
        "path": "python",
        "args": [
          "/path/to/Void-MCP-Server/start.py"
        ],
        "env": {}
      },
      "settings": {}
    }
  }
}
```

Run `python start.py --help` for available options such as `--model`, `--port`, and `--model-port` to customize the servers.
