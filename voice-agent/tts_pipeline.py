#!/usr/bin/env python3
"""
TTS Pipeline for Voice Agent — Edge TTS Russian (free, no API key).
Generates OGG audio from text using Microsoft Edge TTS.
Designed as a pluggable module for the voice agent pipeline.

Usage as library:
    from tts_pipeline import generate_speech
    audio_path = generate_speech("Привет! Я AI-менеджер FocusRunner.")

Usage as CLI:
    python tts_pipeline.py --text "Привет, мир!" --output /tmp/test.ogg
"""

import asyncio
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

WORKSPACE = Path(__file__).parent
DEFAULT_OUTPUT_DIR = WORKSPACE / "tts_output"
DEFAULT_OUTPUT_DIR.mkdir(exist_ok=True)

# Voice configuration
VOICE = "ru-RU-SvetlanaNeural"  # Best Russian female voice (free)
SPEED = "+0%"  # normal speed; use "+10%" for faster, "-10%" for slower

# Quality: bitrate for OGG Opus encoding
OGG_BITRATE = "32k"  # good for voice; 16k minimum, 48k for music


def _check_ffmpeg() -> bool:
    """Check if ffmpeg is available on PATH."""
    return subprocess.run(["which", "ffmpeg"], capture_output=True).returncode == 0


async def _generate_mp3(text: str, output_path: str) -> None:
    """Generate MP3 audio using Edge TTS."""
    import edge_tts

    communicate = edge_tts.Communicate(text, VOICE, rate=SPEED)
    await communicate.save(output_path)


def _mp3_to_ogg(mp3_path: str, ogg_path: str) -> bool:
    """Convert MP3 to OGG Opus using ffmpeg."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", mp3_path,
            "-c:a", "libopus",
            "-b:a", OGG_BITRATE,
            "-application", "voip",  # optimized for speech
            ogg_path,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        print(f"[TTS] ffmpeg error: {result.stderr[:300]}", file=sys.stderr)
        return False
    return True


def generate_speech(
    text: str,
    output_path: Optional[str] = None,
    voice: str = VOICE,
    speed: str = SPEED,
) -> str:
    """
    Generate speech audio from Russian text.

    Args:
        text: Russian text to speak (max ~5000 chars)
        output_path: Where to save the OGG file. Auto-generated if None.
        voice: Edge TTS voice name (default: ru-RU-SvetlanaNeural)
        speed: Speaking rate (default: "+0%")

    Returns:
        Absolute path to the generated OGG audio file.

    Raises:
        RuntimeError: If TTS generation or conversion fails.
    """
    global VOICE, SPEED
    VOICE = voice
    SPEED = speed

    if not text.strip():
        raise ValueError("Text is empty — nothing to speak")

    # Truncate if too long (Edge TTS limit ~5000 chars)
    if len(text) > 4500:
        text = text[:4497] + "..."

    timestamp = int(time.time() * 1000)
    if output_path is None:
        output_path = str(DEFAULT_OUTPUT_DIR / f"tts_{timestamp}.ogg")
    else:
        output_path = str(Path(output_path).with_suffix(".ogg"))

    mp3_path = str(DEFAULT_OUTPUT_DIR / f"tts_{timestamp}.mp3")

    print(f"[TTS] Generating speech ({len(text)} chars, voice={voice})...")

    # Step 1: Generate MP3 via Edge TTS
    try:
        asyncio.run(_generate_mp3(text, mp3_path))
    except Exception as e:
        raise RuntimeError(f"Edge TTS generation failed: {e}") from e

    if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) == 0:
        raise RuntimeError("Edge TTS produced empty output")

    print(f"[TTS] MP3 generated: {os.path.getsize(mp3_path)} bytes")

    # Step 2: Convert MP3 → OGG
    if _check_ffmpeg():
        success = _mp3_to_ogg(mp3_path, output_path)
        # Clean up temp MP3
        if os.path.exists(mp3_path):
            os.remove(mp3_path)
        if not success:
            # Fallback: return MP3 if conversion failed
            print("[TTS] OGG conversion failed, returning MP3 instead", file=sys.stderr)
            os.rename(mp3_path, output_path) if not os.path.exists(output_path) else None
    else:
        print("[TTS] ffmpeg not found, returning MP3", file=sys.stderr)
        os.rename(mp3_path, output_path)

    size = os.path.getsize(output_path)
    print(f"[TTS] Audio ready: {output_path} ({size} bytes)")
    return output_path


# ═══════════════════════════════════════════════════════════════
# Test / Demo
# ═══════════════════════════════════════════════════════════════

def test():
    """Test TTS with a Russian business greeting."""
    test_texts = [
        "Привет! Меня зовут Алиса, я менеджер агентства FocusRunner. Рада познакомиться!",
        "Добрый день! Мы создаём AI-решения для бизнеса: чат-ботов, автоматизацию и веб-приложения. Чем могу помочь?",
    ]

    for i, text in enumerate(test_texts):
        print(f"\n{'='*50}")
        print(f"Test {i+1}: {text[:60]}...")
        try:
            path = generate_speech(text)
            print(f"✅ Success: {path}")
        except Exception as e:
            print(f"❌ Failed: {e}")

    # Clean up test files older than 1 hour
    cutoff = time.time() - 3600
    for f in DEFAULT_OUTPUT_DIR.glob("tts_*"):
        if f.stat().st_mtime < cutoff:
            f.unlink()
            print(f"[CLEANUP] Removed old: {f.name}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Edge TTS Russian voice generator")
    parser.add_argument("--text", type=str, help="Text to speak")
    parser.add_argument("--output", type=str, help="Output file path (.ogg)")
    parser.add_argument("--voice", type=str, default=VOICE, help=f"Voice (default: {VOICE})")
    parser.add_argument("--speed", type=str, default=SPEED, help=f"Speed (default: {SPEED})")
    parser.add_argument("--test", action="store_true", help="Run built-in test")

    args = parser.parse_args()

    if args.test:
        test()
    elif args.text:
        path = generate_speech(args.text, args.output, args.voice, args.speed)
        print(f"\nOutput: {path}")
    else:
        test()
