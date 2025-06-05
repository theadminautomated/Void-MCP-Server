import requests
import streamlit as st

st.set_page_config(page_title="MCP Local LLM", layout="wide")
log = st.logger.get_logger(__name__)

if "server_url" not in st.session_state:
    st.session_state.server_url = "http://localhost:8000"

st.sidebar.title("Settings")
server_url = st.sidebar.text_input("Server URL", st.session_state.server_url)
if server_url != st.session_state.server_url:
    st.session_state.server_url = server_url

st.title("Local LLM Playground")

prompt = st.text_area("Prompt", height=200)
max_tokens = st.slider("Max Tokens", 1, 200, 50)

if st.button("Generate"):
    with st.spinner("Generating..."):
        try:
            resp = requests.post(
                f"{st.session_state.server_url}/generate",
                json={"prompt": prompt, "max_new_tokens": max_tokens},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            st.text_area("Response", value=data.get("text", ""), height=200)
            log.info("generation_success")
        except Exception as exc:
            st.error(f"Error: {exc}")
            log.error("generation_failed", exc_info=exc)
