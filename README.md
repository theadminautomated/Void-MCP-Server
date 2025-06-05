# Void MCP Server

This project provides a Model Context Protocol (MCP) server for storing and retrieving LLM context data. It ships with `run_local.py` for running a lightweight Hugging Face model and `app.py` for a simple Streamlit UI.

## Quick Start

1. **Install prerequisites**
   - Node.js and npm
   - Python 3.11
   - PostgreSQL (ensure the service is running)

2. **Install dependencies**
   ```bash
   npm install          # Node packages
   pip install -r requirements.txt
   ```

3. **Configure the database**

   Create a `.env` file in the project root and set at least the following variables:
   ```env
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_NAME=llm_context_db
   DATABASE_USER=your_db_user
   DATABASE_PASSWORD=your_db_password  # must be a string
   PORT=3000
   JWT_SECRET=change-me-in-production-min-32-chars
   ```
   If `DATABASE_PASSWORD` is missing you will see the error:
   `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`.

4. **Build the server**
   ```bash
   npm run build
   ```

5. **Run everything**
   ```bash
   python start.py
   ```
   The MCP API will be available at `http://localhost:3000` and the local model server at `http://localhost:8000`. Press `Ctrl+C` to stop them.

6. **Optional: Launch the Streamlit interface**
   ```bash
   streamlit run app.py
   ```

## Development Tips

- Run tests with `pytest` and `npm test`.
- Start only the local model using `python run_local.py --model sshleifer/tiny-gpt2 --port 8000`.
- Format and lint with `pre-commit run --all-files`.
- `setup.sh` provides an interactive database setup if you need it.



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

