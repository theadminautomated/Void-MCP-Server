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
