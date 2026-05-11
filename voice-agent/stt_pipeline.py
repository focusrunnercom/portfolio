#!/usr/bin/env python3
"""
STT Pipeline for Jetson Orin — record audio via arecord + transcribe via faster-whisper.
Russian speech → text. Lightweight, works on ARM64 without torch.
"""

import subprocess
import sys
import os
import time
from pathlib import Path

WORKSPACE = Path(__file__).parent
AUDIO_FILE = WORKSPACE / "recording.wav"
RESULT_FILE = WORKSPACE / "stt_test.txt"

# --- Recording ---
DURATION = 5  # seconds
SAMPLE_RATE = 16000
DEVICE = "hw:1,0"  # Jetson APE card 1, device 0

def record_audio(duration: int = DURATION) -> bool:
    """Record mono 16kHz WAV via ALSA arecord. Returns True if audio captured."""
    cmd = [
        "arecord",
        "-D", DEVICE,
        "-f", "S16_LE",
        "-r", str(SAMPLE_RATE),
        "-c", "1",
        "-d", str(duration),
        "--nonblock",  # don't hang if no data
        str(AUDIO_FILE),
    ]
    print(f"[REC] Recording {duration}s from {DEVICE} at {SAMPLE_RATE}Hz...")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=duration + 10)
    except subprocess.TimeoutExpired:
        print("[REC] Timed out — no audio data arriving (mic not connected?)")
        return False
    if result.returncode != 0:
        print(f"[REC] arecord failed (rc={result.returncode}): {result.stderr.strip()}")
    if AUDIO_FILE.exists():
        size = AUDIO_FILE.stat().st_size
        print(f"[REC] Captured {size} bytes → {AUDIO_FILE}")
        return size > 1000
    return False


# --- Transcription ---
def transcribe_audio() -> str:
    """Transcribe WAV using faster-whisper tiny model."""
    from faster_whisper import WhisperModel

    print("[STT] Loading faster-whisper-tiny model...")
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    # int8 is fast on ARM64 CPU; no need for float16

    print(f"[STT] Transcribing {AUDIO_FILE}...")
    segments, info = model.transcribe(
        str(AUDIO_FILE),
        language="ru",
        beam_size=5,
        vad_filter=True,  # filter out silence
    )
    print(f"[STT] Detected language: {info.language} (p={info.language_probability:.2f})")

    lines = []
    for seg in segments:
        line = f"[{seg.start:.1f}s → {seg.end:.1f}s] {seg.text.strip()}"
        print(line)
        lines.append(line)

    return "\n".join(lines)


# --- Main ---
def main():
    print("=" * 50)
    print("STT Pipeline Test — faster-whisper on Jetson Orin")
    print("=" * 50)

    # Step 1: Record
    recorded = record_audio()

    # Step 2: Transcribe
    transcription = ""
    if recorded:
        try:
            transcription = transcribe_audio()
        except Exception as e:
            print(f"[FAIL] Transcription error: {e}", file=sys.stderr)
            _write_result(f"ERROR: {e}")
            sys.exit(1)
    else:
        print("[INFO] No audio captured — pipeline code is ready, awaiting microphone hardware.")
        print("[INFO] Connect a USB mic, I2S MEMS mic, or HDMI audio capture to test.")

    # Step 3: Save result
    _write_result(transcription if transcription else "(no microphone detected — pipeline ready, awaiting hardware)")

    # Clean up
    AUDIO_FILE.unlink(missing_ok=True)
    sys.exit(0)

def _write_result(transcription: str) -> None:
    """Save test results to workspace."""
    import time
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    audio_info = ""
    if AUDIO_FILE.exists():
        size = AUDIO_FILE.stat().st_size
        audio_info = f"Audio: {AUDIO_FILE} ({size} bytes, {DURATION}s, {SAMPLE_RATE}Hz mono)\nDevice: {DEVICE}\n"
    output = f"""STT Pipeline Test Results
=======================
Timestamp: {timestamp}
Model: faster-whisper-tiny (cpu/int8)
Language: Russian (ru)
{audio_info}
Transcription:
{transcription}
"""
    RESULT_FILE.write_text(output, encoding="utf-8")
    print(f"\n[DONE] Results saved → {RESULT_FILE}")


if __name__ == "__main__":
    main()
