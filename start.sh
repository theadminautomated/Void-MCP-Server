#!/bin/bash
set -e

# One-click startup script for MCP server and local model

MODEL=${MODEL:-"sshleifer/tiny-gpt2"}
NODE_PORT=${PORT:-3000}
MODEL_PORT=${MODEL_PORT:-8000}

# Install Node dependencies if missing
if [ ! -d node_modules ]; then
  echo "Installing Node dependencies..."
  npm install --silent
fi

# Build TypeScript project if dist is missing
if [ ! -d dist ]; then
  echo "Building MCP server..."
  npm run build --silent
fi

# Start MCP server
node dist/index.js &
NODE_PID=$!

# Start local model server
python run_local.py --model "$MODEL" --port "$MODEL_PORT" &
MODEL_PID=$!

# Output connection info
cat <<INFO
MCP Server running on http://localhost:$NODE_PORT
Local model server running on http://localhost:$MODEL_PORT
Server PIDs: MCP=$NODE_PID, MODEL=$MODEL_PID
Press Ctrl+C to stop both processes.
INFO

wait $NODE_PID $MODEL_PID
