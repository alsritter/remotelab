#!/usr/bin/env python3

import contextlib
import io
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import mlx_whisper
except Exception:
    mlx_whisper = None

DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo-q4"


def trim(value):
    return str(value or "").strip()


def normalize_for_match(value):
    normalized = trim(value).lower()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def play_ack_sound(path):
    normalized = trim(path)
    if not normalized:
        return
    executable = "afplay" if platform.system() == "Darwin" else None
    if executable:
        try:
            subprocess.run([executable, normalized], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except Exception:
            pass
    try:
        sys.stdout.write("\a")
        sys.stdout.flush()
    except Exception:
        pass


def default_input_backend():
    system = platform.system()
    if system == "Darwin":
        return "avfoundation"
    if system == "Linux":
        return "pulse"
    raise RuntimeError(f"Unsupported platform for microphone capture: {system}")


def default_input_source(backend):
    if backend == "avfoundation":
        return "0"
    if backend == "pulse":
        return "default"
    if backend == "alsa":
        return "default"
    raise RuntimeError(f"Unsupported input backend: {backend}")


def build_ffmpeg_input_args(backend, source):
    normalized_backend = trim(backend) or default_input_backend()
    normalized_source = trim(source) or default_input_source(normalized_backend)
    if normalized_backend == "avfoundation":
        spec = normalized_source if normalized_source.startswith(":") else f":{normalized_source}"
        return ["-f", "avfoundation", "-i", spec]
    if normalized_backend == "pulse":
        return ["-f", "pulse", "-i", normalized_source]
    if normalized_backend == "alsa":
        return ["-f", "alsa", "-i", normalized_source]
    raise RuntimeError(f"Unsupported input backend: {normalized_backend}")


def run_command(args, *, capture_output=False):
    kwargs = {
        "check": True,
        "text": True,
    }
    if capture_output:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    else:
        kwargs["stdout"] = subprocess.DEVNULL
        kwargs["stderr"] = subprocess.DEVNULL
    return subprocess.run(args, **kwargs)


def record_audio(output_path, *, duration_seconds, backend=None, source=None):
    output_path = str(Path(output_path).expanduser().resolve())
    backend = trim(backend) or default_input_backend()
    source = trim(source) or default_input_source(backend)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        *build_ffmpeg_input_args(backend, source),
        "-t",
        str(duration_seconds),
        "-ac",
        "1",
        "-ar",
        "16000",
        output_path,
    ]
    run_command(cmd, capture_output=False)
    return output_path


def transcribe_audio(audio_path, *, model=DEFAULT_MODEL, language="", initial_prompt=""):
    if mlx_whisper is None:
        raise RuntimeError("mlx_whisper is unavailable in the current Python environment")
    decode_options = {}
    normalized_language = trim(language)
    if normalized_language:
        decode_options["language"] = normalized_language
    sink = io.StringIO()
    with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        result = mlx_whisper.transcribe(
            str(Path(audio_path).expanduser().resolve()),
            path_or_hf_repo=model,
            verbose=False,
            initial_prompt=trim(initial_prompt) or None,
            condition_on_previous_text=False,
            temperature=0.0,
            **decode_options,
        )
    return {
        "text": trim(result.get("text", "")),
        "language": trim(result.get("language", normalized_language)),
        "segments": result.get("segments", []),
    }


def make_temp_wav(prefix):
    handle = tempfile.NamedTemporaryFile(prefix=prefix, suffix=".wav", delete=False)
    handle.close()
    return handle.name


def extract_trailing_text(original_text, wake_phrase):
    original = trim(original_text)
    phrase = trim(wake_phrase)
    if not original or not phrase:
        return ""
    lowered_original = original.lower()
    lowered_phrase = phrase.lower()
    index = lowered_original.rfind(lowered_phrase)
    if index < 0:
        return ""
    suffix = original[index + len(phrase):]
    suffix = suffix.strip().strip("，。！？；：,.!?;:-—…[](){}<>\"'“”‘’")
    return trim(suffix)


def resolve_trigger_transcript(original_text, wake_phrase, transcript_mode="full"):
    raw_text = trim(original_text)
    mode = trim(transcript_mode).lower() or "full"
    if mode == "after-wake":
        trailing = extract_trailing_text(raw_text, wake_phrase)
        return trailing or raw_text
    return raw_text


def emit_json(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()
