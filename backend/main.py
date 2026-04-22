"""Clip backend — Vosk (STT) + llama.cpp (LLM) + Piper (TTS)."""

from __future__ import annotations

import asyncio
import io
import json
import os
import subprocess
import tempfile
import wave
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# ── Model paths (override via env vars) ──────────────────────────────────────

_MODELS_DIR = Path(__file__).parent / "models"

VOSK_MODEL_PATH = os.environ.get("VOSK_MODEL", str(_MODELS_DIR / "vosk-model"))
LLAMA_MODEL_PATH = os.environ.get("LLAMA_MODEL", str(_MODELS_DIR / "llm.gguf"))
PIPER_MODEL_PATH = os.environ.get("PIPER_MODEL", str(_MODELS_DIR / "en_US-lessac-medium.onnx"))

# ── Global model handles ──────────────────────────────────────────────────────

_vosk_model: Any = None   # vosk.Model
_llama: Any = None        # llama_cpp.Llama
_piper_voice: Any = None  # piper.PiperVoice

# ── Vosk STT ──────────────────────────────────────────────────────────────────

def _load_vosk() -> Any:
    try:
        import vosk  # type: ignore
    except ImportError:
        print("[clip] vosk not installed — STT unavailable. Run: pip install vosk")
        return None
    if not Path(VOSK_MODEL_PATH).exists():
        print(
            f"[clip] Vosk model not found at {VOSK_MODEL_PATH}. "
            "Download from https://alphacephei.com/vosk/models and set VOSK_MODEL env var."
        )
        return None
    vosk.SetLogLevel(-1)
    return vosk.Model(VOSK_MODEL_PATH)


def _transcribe_vosk(wav_path: str) -> str:
    import vosk  # type: ignore

    assert _vosk_model is not None
    with wave.open(wav_path, "rb") as wf:
        rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
    rec = vosk.KaldiRecognizer(_vosk_model, rate)
    rec.AcceptWaveform(frames)
    result = json.loads(rec.FinalResult())
    return result.get("text", "").strip()


# ── llama.cpp LLM ─────────────────────────────────────────────────────────────

def _load_llama() -> Any:
    try:
        from llama_cpp import Llama  # type: ignore
    except ImportError:
        print("[clip] llama-cpp-python not installed — LLM unavailable. Run: pip install llama-cpp-python")
        return None
    if not Path(LLAMA_MODEL_PATH).exists():
        print(
            f"[clip] GGUF model not found at {LLAMA_MODEL_PATH}. "
            "Download a GGUF model and set LLAMA_MODEL env var."
        )
        return None
    n_gpu_layers = int(os.environ.get("N_GPU_LAYERS", "0"))
    return Llama(model_path=LLAMA_MODEL_PATH, n_ctx=4096, n_gpu_layers=n_gpu_layers, verbose=False)


class CompleteRequest(BaseModel):
    messages: list[dict[str, str]]
    temperature: float = 0.0
    max_tokens: int = 1024


# ── Piper TTS ─────────────────────────────────────────────────────────────────

def _load_piper() -> Any:
    try:
        from piper import PiperVoice  # type: ignore
    except ImportError:
        print("[clip] piper-tts not installed — TTS unavailable. Run: pip install piper-tts")
        return None
    onnx = Path(PIPER_MODEL_PATH)
    if not onnx.exists():
        print(
            f"[clip] Piper model not found at {PIPER_MODEL_PATH}. "
            "Download from https://huggingface.co/rhasspy/piper-voices and set PIPER_MODEL env var."
        )
        return None
    config = Path(str(onnx) + ".json")
    return PiperVoice.load(str(onnx), config_path=str(config) if config.exists() else None)


def _synthesize_piper(text: str) -> bytes:
    assert _piper_voice is not None
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        _piper_voice.synthesize(text, wf)
    return buf.getvalue()


# ── Audio helpers ─────────────────────────────────────────────────────────────

def _wav_summary(path: str) -> tuple[int, int, int] | None:
    try:
        with wave.open(path, "rb") as w:
            return (w.getnchannels(), w.getframerate(), w.getnframes())
    except wave.Error:
        return None


def _canonical_wav(src: str) -> str:
    """Re-write WAV header in-place to guarantee a clean PCM container."""
    with wave.open(src, "rb") as w:
        nch, sw, sr = w.getnchannels(), w.getsampwidth(), w.getframerate()
        frames = w.readframes(w.getnframes())
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    with wave.open(tmp.name, "wb") as wo:
        wo.setnchannels(nch)
        wo.setsampwidth(sw)
        wo.setframerate(sr)
        wo.writeframes(frames)
    try:
        os.unlink(src)
    except OSError:
        pass
    return tmp.name


def _ffmpeg_to_wav(src: str) -> str | None:
    import shutil

    if not shutil.which("ffmpeg"):
        return None
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", src, "-ac", "1", "-ar", "16000", "-f", "wav", tmp.name,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        return None
    return tmp.name


def _raw_pcm_wav(data: bytes) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    with wave.open(tmp.name, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16_000)
        w.writeframes(data)
    return tmp.name


def _prepare_wav(raw_path: str, raw_bytes: bytes) -> str:
    """Return a clean WAV path usable by Vosk (caller is responsible for deletion)."""
    if _wav_summary(raw_path) is not None:
        return _canonical_wav(raw_path)
    ff = _ffmpeg_to_wav(raw_path)
    if ff is not None:
        try:
            os.unlink(raw_path)
        except OSError:
            pass
        return ff
    try:
        os.unlink(raw_path)
    except OSError:
        pass
    return _raw_pcm_wav(raw_bytes)


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _vosk_model, _llama, _piper_voice
    _vosk_model = _load_vosk()
    _llama = _load_llama()
    _piper_voice = _load_piper()
    yield


app = FastAPI(title="Clip Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "stt": "vosk" if _vosk_model is not None else "unavailable",
        "llm": "llama.cpp" if _llama is not None else "unavailable",
        "tts": "piper" if _piper_voice is not None else "unavailable",
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    if _vosk_model is None:
        raise HTTPException(status_code=503, detail="Vosk model not loaded — set VOSK_MODEL env var")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    suffix = Path(file.filename or "audio.wav").suffix.lower() or ".wav"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.flush()
    finally:
        tmp.close()

    wav_path: str | None = None
    try:
        wav_path = _prepare_wav(tmp.name, data)
        info = _wav_summary(wav_path)
        if info is None:
            raise HTTPException(
                status_code=400,
                detail="Could not decode audio. Use 16-bit PCM WAV or install ffmpeg.",
            )
        _, rate, frame_count = info
        if frame_count < int(rate * 0.15):
            raise HTTPException(status_code=400, detail="Audio too short — record at least 0.15s.")

        loop = asyncio.get_running_loop()
        transcript = await loop.run_in_executor(None, _transcribe_vosk, wav_path)
        return {"transcript": transcript, "backend": "vosk"}
    finally:
        for p in {tmp.name, wav_path}:
            if p:
                try:
                    if os.path.exists(p):
                        os.unlink(p)
                except OSError:
                    pass


@app.post("/complete")
async def complete(req: CompleteRequest) -> dict[str, Any]:
    if _llama is None:
        raise HTTPException(status_code=503, detail="LLM not loaded — set LLAMA_MODEL env var")

    def _run() -> str:
        result = _llama.create_chat_completion(
            messages=req.messages,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
        return result["choices"][0]["message"]["content"]

    loop = asyncio.get_running_loop()
    text = await loop.run_in_executor(None, _run)
    return {"response": text, "success": True}


@app.get("/tts")
async def tts_get(text: str) -> Response:
    if _piper_voice is None:
        raise HTTPException(status_code=503, detail="Piper TTS not loaded — set PIPER_MODEL env var")
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    loop = asyncio.get_running_loop()
    audio = await loop.run_in_executor(None, _synthesize_piper, text)
    return Response(content=audio, media_type="audio/wav")


def main() -> None:
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
