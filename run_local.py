import argparse
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

MODEL_DIR = Path("models")


class GenerateRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 50


class LocalModelServer:
    def __init__(self, model_name: str, quant: bool = False):
        self.model_name = model_name
        self.quant = quant
        self.pipe = self._load_pipeline()

    def _load_pipeline(self):
        model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            cache_dir=str(MODEL_DIR),
        )
        tokenizer = AutoTokenizer.from_pretrained(
            self.model_name,
            cache_dir=str(MODEL_DIR),
        )
        return pipeline("text-generation", model=model, tokenizer=tokenizer)

    def generate(self, prompt: str, max_new_tokens: int = 50) -> str:
        outputs = self.pipe(prompt, max_new_tokens=max_new_tokens)
        return outputs[0]["generated_text"]

    def create_app(self) -> FastAPI:
        app = FastAPI()

        @app.post("/generate")
        def generate_text(req: GenerateRequest):
            try:
                text = self.generate(req.prompt, req.max_new_tokens)
                return JSONResponse({"text": text})
            except Exception as exc:  # pragma: no cover - unexpected errors
                raise HTTPException(status_code=500, detail=str(exc))

        return app


def main():
    parser = argparse.ArgumentParser(description="Run local HF model server.")
    parser.add_argument(
        "--model", default="sshleifer/tiny-gpt2", help="Model name or path"
    )
    parser.add_argument(
        "--quant", action="store_true", help="Enable quantization (unused)"
    )
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = LocalModelServer(args.model, args.quant)
    app = server.create_app()
    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
