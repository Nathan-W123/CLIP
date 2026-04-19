"""Minimal HTTP API: upload WAV and transcribe via Cactus.

Default path uses dedicated STT models (Parakeet TDT) via ``cactus_transcribe`` — this is what
the ``cactus transcribe`` CLI uses and matches real speech-to-text behavior.

Optional ``STT_BACKEND=gemma`` uses Gemma 4 multimodal ``cactus_complete`` with audio paths (may
produce empty text or tool-style outputs for some prompts; worse verbatim ASR than Parakeet).
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import wave
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Imports below require Cactus repo layout: ../cactus/python on PYTHONPATH.
_CACTUS_REPO = Path(
    os.environ.get(
        "CACTUS_REPO",
        Path(__file__).resolve().parent.parent / "cactus",
    )
)
import sys

sys.path.insert(0, str(_CACTUS_REPO / "python"))

from src.cactus import (  # noqa: E402
    cactus_complete,
    cactus_destroy,
    cactus_init,
    cactus_transcribe,
)
from src.downloads import ensure_model  # noqa: E402

# stt = cactus_transcribe (Parakeet/Whisper/…); gemma = multimodal cactus_complete
STT_BACKEND = os.environ.get("STT_BACKEND", "stt").strip().lower()
STT_MODEL = os.environ.get("STT_MODEL", "nvidia/parakeet-tdt-0.6b-v3")
GEMMA_MODEL = os.environ.get("CACTUS_MODEL", "google/gemma-4-E2B-it")

MODEL_ID = GEMMA_MODEL if STT_BACKEND == "gemma" else STT_MODEL

_model_handle: int | None = None


def _completion_options() -> str:
    return json.dumps(
        {
            "max_tokens": 2048,
            "temperature": 0.0,
            "auto_handoff": False,
            "confidence_threshold": 0.0,
        }
    )


def _run_transcribe_stt(temp_path: str) -> dict[str, Any]:
    assert _model_handle is not None
    raw = cactus_transcribe(_model_handle, temp_path, None, None, None, None)
    return json.loads(raw)


def _run_complete_gemma(temp_path: str) -> dict[str, Any]:
    assert _model_handle is not None
    messages = json.dumps(
        [
            {
                "role": "system",
                "content": (
                    "You are a speech-to-text system. "
                    "Write the spoken words as plain text only. "
                    "Do not use tools, function calls, or preambles."
                ),
            },
            {
                "role": "user",
                "content": "Transcribe this audio verbatim.",
                "audio": [temp_path],
            },
        ]
    )
    raw = cactus_complete(
        _model_handle, messages, _completion_options(), None, None
    )
    return json.loads(raw)


def _run_inference(temp_path: str) -> dict[str, Any]:
    if STT_BACKEND == "gemma":
        return _run_complete_gemma(temp_path)
    return _run_transcribe_stt(temp_path)


def _wav_summary(path: str) -> tuple[int, int, int] | None:
    """Return (channels, sample_rate, nframes) or None if not a readable WAV."""
    try:
        with wave.open(path, "rb") as w:
            return (w.getnchannels(), w.getframerate(), w.getnframes())
    except wave.Error:
        return None


def _canonical_wav_path(source_path: str) -> str:
    """Re-encode through ``wave`` so Cactus gets a plain PCM WAV (fixes iOS \"partial\" RIFF)."""
    with wave.open(source_path, "rb") as w:
        nch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        frames = w.readframes(w.getnframes())
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    name = out.name
    out.close()
    with wave.open(name, "wb") as wo:
        wo.setnchannels(nch)
        wo.setsampwidth(sw)
        wo.setframerate(sr)
        wo.writeframes(frames)
    return name


def _raw_pcm16_mono_16k_wav(data: bytes) -> str:
    """Fallback: treat entire payload as int16 mono @ 16 kHz (no container)."""
    if len(data) < 2 or len(data) % 2 != 0:
        raise ValueError("raw pcm length")
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    name = out.name
    out.close()
    with wave.open(name, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16_000)
        w.writeframes(data)
    return name


def _prepare_audio_tempfile(initial_path: str, raw_upload: bytes) -> str:
    """Return path to a WAV file suitable for libcactus (caller deletes when done)."""
    if _wav_summary(initial_path) is not None:
        canon = _canonical_wav_path(initial_path)
        try:
            os.unlink(initial_path)
        except OSError:
            pass
        return canon
    try:
        os.unlink(initial_path)
    except OSError:
        pass
    return _raw_pcm16_mono_16k_wav(raw_upload)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model_handle
    weights = ensure_model(MODEL_ID)
    _model_handle = cactus_init(str(weights), None, False)
    try:
        yield
    finally:
        if _model_handle is not None:
            cactus_destroy(_model_handle)
            _model_handle = None


app = FastAPI(title="Cactus STT", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "backend": STT_BACKEND,
        "model": MODEL_ID,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    if _model_handle is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    raw_path = tmp.name
    try:
        tmp.write(data)
        tmp.flush()
    finally:
        tmp.close()

    try:
        path = _prepare_audio_tempfile(raw_path, data)
    except (ValueError, OSError, wave.Error) as e:
        try:
            os.unlink(raw_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=400,
            detail=f"Could not read audio ({e!s}). Use 16-bit PCM WAV, mono 16 kHz.",
        ) from e

    info = _wav_summary(path)
    if info is None:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise HTTPException(
            status_code=400,
            detail="Upload must be a valid WAV file.",
        )
    _, rate, frames = info
    if frames < int(rate * 0.15):
        try:
            os.unlink(path)
        except OSError:
            pass
        raise HTTPException(
            status_code=400,
            detail="Audio too short; record at least ~0.15s of speech.",
        )

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, _run_inference, path)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    if not result.get("success"):
        raise HTTPException(
            status_code=502,
            detail=result.get("error") or "Transcription failed",
        )
    text = result.get("response") or ""
    return {
        "transcript": text,
        "backend": STT_BACKEND,
        "model": MODEL_ID,
        "raw": result,
    }


def main() -> None:
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
