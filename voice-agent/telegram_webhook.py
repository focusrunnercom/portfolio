#!/usr/bin/env python3
"""
Telegram Voice Agent Webhook — wires STT → Conversation Flow → TTS → Telegram.
Part 4 of voice AI agent pipeline (FOC-34).

Receives voice messages from Telegram, transcribes via faster-whisper,
processes through lead qualification conversation flow, generates
TTS response via Edge TTS, sends back text + voice message.

Architecture:
  Telegram voice msg → STT (faster-whisper) → ConversationFlow → TTS (Edge TTS)
       ↑                                                              ↓
       └────────────────── Telegram reply ────────────────────────────┘

Run:
  python voice-agent/telegram_webhook.py
"""

import asyncio
import os
import sys
import time
import tempfile
from pathlib import Path
from typing import Optional

# ── Add voice-agent dir to path for imports ──
sys.path.insert(0, str(Path(__file__).parent))

# ── Load .env ──
_ENV_PATH = Path.home() / ".hermes" / ".env"
if _ENV_PATH.exists():
    with open(_ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val

from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from telegram.constants import ChatAction
import requests

# ── Import project modules ──
from conversation_flow import ConversationFlow, State
from tts_pipeline import generate_speech as tts_generate

# ═══════════════════════════════════════════════════════════════
# STT: faster-whisper (reusable — accepts any audio file path)
# ═══════════════════════════════════════════════════════════════

def transcribe_audio_file(audio_path: str, language: str = "ru") -> str:
    """
    Transcribe any audio file using faster-whisper tiny model.
    Accepts WAV, OGG, MP3, etc. (faster-whisper uses FFmpeg internally).
    
    Returns: transcribed text (empty string on failure).
    """
    from faster_whisper import WhisperModel
    
    print(f"  [STT] Loading faster-whisper-tiny model...")
    model: Optional[WhisperModel] = None
    
    # Warm-up delay: faster-whisper loads ~70MB on first call (~5-8s on Orin)
    t0 = time.time()
    try:
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
    except Exception as e:
        print(f"  [STT] Model load failed: {e}", file=sys.stderr)
        return ""
    print(f"  [STT] Model loaded in {time.time() - t0:.1f}s")
    
    try:
        segments, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=5,
            vad_filter=True,
        )
        print(f"  [STT] Language: {info.language} (p={info.language_probability:.2f})")
        
        lines = []
        for seg in segments:
            lines.append(seg.text.strip())
            print(f"    [{seg.start:.1f}s→{seg.end:.1f}s] {seg.text.strip()}")
        
        return " ".join(lines).strip()
    except Exception as e:
        print(f"  [STT] Transcription error: {e}", file=sys.stderr)
        return ""


# ═══════════════════════════════════════════════════════════════
# Per-chat conversation state
# ═══════════════════════════════════════════════════════════════

# Map chat_id → ConversationFlow (in-memory, lost on restart)
_chats: dict[int, ConversationFlow] = {}

def get_or_create_flow(chat_id: int) -> ConversationFlow:
    """Return existing conversation for this chat, or create a new one."""
    if chat_id not in _chats:
        flow = ConversationFlow()
        _chats[chat_id] = flow
        print(f"  [FLOW] New conversation started for chat {chat_id}")
    return _chats[chat_id]

def end_conversation(chat_id: int) -> Optional[dict]:
    """End conversation for a chat, return summary."""
    flow = _chats.pop(chat_id, None)
    if flow:
        flow.state = State.CLOSE
        # Don't call end_call yet — let the user get the closing message first
        return flow.get_summary()
    return None


# ═══════════════════════════════════════════════════════════════
# Telegram Bot Handlers
# ═══════════════════════════════════════════════════════════════

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

if not TELEGRAM_BOT_TOKEN:
    print("❌ FATAL: TELEGRAM_BOT_TOKEN not set in ~/.hermes/.env")
    sys.exit(1)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start — begin a new lead qualification conversation."""
    chat_id = update.effective_chat.id
    
    # End any existing conversation
    end_conversation(chat_id)
    
    flow = get_or_create_flow(chat_id)
    
    # Send typing indicator
    await update.effective_chat.send_action(ChatAction.TYPING)
    
    # Generate greeting
    greeting = flow.start_call()
    print(f"  [BOT] Greeting: «{greeting[:80]}»")
    
    # Send text
    await update.message.reply_text(greeting)
    
    # Generate TTS
    try:
        await update.effective_chat.send_action(ChatAction.RECORD_VOICE)
        audio_path = tts_generate(greeting)
        with open(audio_path, "rb") as f:
            await update.message.reply_voice(voice=f)
        print(f"  [BOT] Voice reply sent ({os.path.getsize(audio_path)} bytes)")
    except Exception as e:
        print(f"  [BOT] TTS failed (text-only fallback): {e}", file=sys.stderr)


async def voice_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handle incoming voice message:
    1. Download voice file
    2. Transcribe via faster-whisper
    3. Process through conversation flow
    4. Generate TTS response
    5. Send text + voice reply
    """
    chat_id = update.effective_chat.id
    voice = update.message.voice
    
    if not voice:
        await update.message.reply_text("⚠️ Не удалось получить голосовое сообщение.")
        return
    
    # ── Step 1: Download voice file ──
    print(f"\n📥 [VOICE] Chat {chat_id}: downloading voice (duration={voice.duration}s, size={voice.file_size}B)")
    
    # Send typing indicator while processing
    await update.effective_chat.send_action(ChatAction.TYPING)
    
    voice_file = await voice.get_file()
    
    # Save to temp file for STT
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp_path = tmp.name
    await voice_file.download_to_drive(tmp_path)
    print(f"  [VOICE] Downloaded to {tmp_path} ({os.path.getsize(tmp_path)} bytes)")
    
    # ── Step 2: Transcribe ──
    print(f"  [STT] Transcribing...")
    transcript = transcribe_audio_file(tmp_path, language="ru")
    
    # Clean up temp file
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    
    if not transcript:
        print(f"  [STT] Empty transcript — sending fallback")
        await update.message.reply_text("Извините, я не разобрала, что вы сказали. Повторите, пожалуйста?")
        return
    
    print(f"  [STT] Transcript: «{transcript[:120]}»")
    
    # ── Step 3: Process through conversation flow ──
    flow = get_or_create_flow(chat_id)
    
    await update.effective_chat.send_action(ChatAction.TYPING)
    
    try:
        response_text = flow.process_user_input(transcript)
    except Exception as e:
        print(f"  [FLOW] Error: {e}", file=sys.stderr)
        response_text = "Извините, произошла ошибка. Давайте попробуем ещё раз."
    
    if not response_text:
        print(f"  [FLOW] No response — conversation ended")
        summary = end_conversation(chat_id)
        if summary:
            await update.message.reply_text(
                f"Спасибо за разговор! Мы свяжемся с вами в ближайшее время.\n\n"
                f"(Звонок {summary['call_id']}, длительность {summary['duration_seconds']}с)"
            )
        return
    
    print(f"  [FLOW] Response ({flow.state.value}): «{response_text[:120]}»")
    
    # ── Step 4: Send text reply ──
    await update.message.reply_text(response_text)
    
    # ── Step 5: Generate TTS and send voice ──
    try:
        await update.effective_chat.send_action(ChatAction.RECORD_VOICE)
        audio_path = tts_generate(response_text)
        with open(audio_path, "rb") as f:
            await update.message.reply_voice(voice=f)
        print(f"  [BOT] Voice reply sent ({os.path.getsize(audio_path)} bytes)")
    except Exception as e:
        print(f"  [BOT] TTS failed (text-only reply): {e}", file=sys.stderr)
    
    # ── Auto-close if conversation ended ──
    if flow.state == State.ENDED:
        summary = end_conversation(chat_id)
        if summary:
            print(f"  [FLOW] Conversation ended. Summary: {summary}")


async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handle text messages — process through conversation flow.
    Useful for testing without voice, or when STT fails.
    """
    chat_id = update.effective_chat.id
    user_text = update.message.text.strip()
    print(f"\n📥 [TEXT] Chat {chat_id}: «{user_text[:80]}»")
    
    await update.effective_chat.send_action(ChatAction.TYPING)
    
    flow = get_or_create_flow(chat_id)
    
    try:
        response_text = flow.process_user_input(user_text)
    except Exception as e:
        print(f"  [FLOW] Error: {e}", file=sys.stderr)
        response_text = "Извините, произошла ошибка. Давайте попробуем ещё раз."
    
    if not response_text:
        summary = end_conversation(chat_id)
        await update.message.reply_text("Спасибо за разговор! Мы свяжемся с вами.")
        return
    
    print(f"  [FLOW] Response ({flow.state.value}): «{response_text[:120]}»")
    
    await update.message.reply_text(response_text)
    
    try:
        await update.effective_chat.send_action(ChatAction.RECORD_VOICE)
        audio_path = tts_generate(response_text)
        with open(audio_path, "rb") as f:
            await update.message.reply_voice(voice=f)
    except Exception as e:
        print(f"  [BOT] TTS failed: {e}", file=sys.stderr)


async def reset_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /reset — forcibly end conversation and start fresh."""
    chat_id = update.effective_chat.id
    end_conversation(chat_id)
    print(f"  [BOT] Conversation reset for chat {chat_id}")
    await update.message.reply_text("🔄 Разговор сброшен. Отправьте /start чтобы начать заново.")


# ═══════════════════════════════════════════════════════════════
# Main — polling mode (no webhook needed for testing)
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("🎙️  TELEGRAM VOICE AGENT — STT → LLM → TTS Pipeline")
    print("=" * 60)
    print(f"   Bot token: {TELEGRAM_BOT_TOKEN[:12]}...{TELEGRAM_BOT_TOKEN[-4:]}")
    print(f"   Mode: polling (checks Telegram every 2s)")
    print(f"   Voice: ru-RU-SvetlanaNeural (Edge TTS)")
    print(f"   LLM:  OpenRouter (gemini-2.5-flash-lite)")
    print(f"   STT:  faster-whisper-tiny (cpu/int8)")
    print("=" * 60)
    print()
    print("  Команды бота:")
    print("    /start  — начать разговор с агентом")
    print("    /reset  — сбросить разговор")
    print("    Отправьте голосовое сообщение чтобы начать диалог")
    print()
    
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    
    # Register handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("reset", reset_command))
    app.add_handler(MessageHandler(filters.VOICE, voice_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))
    
    print("🤖 Бот запущен. Нажмите Ctrl+C для остановки.")
    print()
    
    # Run bot
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
