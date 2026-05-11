#!/usr/bin/env python3
"""
Conversation Flow — lead qualification voice agent (Russian).
LLM system prompt + state machine + call recording.
Designed to plug into STT (FOC-26) and TTS (FOC-32) pipelines.

Architecture:
  STT (text) → conversation_flow.py → TTS (audio)
                   ↓
            call_record.jsonl
"""

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

import requests

# ─────────────────── Configuration ───────────────────
WORKSPACE = Path(__file__).parent
RECORDINGS_DIR = WORKSPACE / "call_recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)

# Load .env from ~/.hermes/.env (idempotent — won't override already-set vars)
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

# LLM
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
LLM_MODEL = "google/gemini-2.5-flash-lite"  # fast, free-tier eligible
LLM_MAX_TOKENS = 150  # short voice replies only
LLM_TEMPERATURE = 0.7

# Conversation limits
MAX_TURNS = 12  # max exchanges before auto-close
MAX_IDLE_SECONDS = 30  # if no user input, agent prompts


# ─────────────────── State Machine ───────────────────
class State(str, Enum):
    GREETING = "greeting"
    QUALIFYING = "qualifying"
    DETAILS = "details"
    CLOSE = "close"
    ENDED = "ended"


TRANSITIONS = {
    State.GREETING: [State.QUALIFYING, State.CLOSE],
    State.QUALIFYING: [State.DETAILS, State.CLOSE],
    State.DETAILS: [State.QUALIFYING, State.CLOSE],
    State.CLOSE: [State.ENDED],
    State.ENDED: [],
}

STATE_QUESTIONS = {
    State.GREETING: "Поприветствуй, представься как AI-менеджер агентства FocusRunner, спроси имя.",
    State.QUALIFYING: (
        "Задай 1 квалифицирующий вопрос: какой бизнес, какие задачи хотят решить с помощью AI, "
        "есть ли бюджет на AI-решения. Не более 1 вопроса за раз."
    ),
    State.DETAILS: (
        "Углубись в детали: объём проекта, сроки, кто принимает решение. "
        "Если проект fits — предложи следующий шаг (созвон с человеком-менеджером)."
    ),
    State.CLOSE: (
        "Заверши разговор. Если лид квалифицирован — подтверди, что команда свяжется в течение 24 часов. "
        "Если нет — вежливо попрощайся и предложи оставить контакты на будущее."
    ),
}

# ─────────────────── System Prompt ───────────────────
SYSTEM_PROMPT = """Ты — AI-менеджер по продажам агентства FocusRunner. Мы создаём AI-решения для бизнеса: чат-боты, автоматизацию, AI-агентов, веб-приложения с AI.

Твой стиль общения:
- Коротко. 1-3 предложения за раз. Это голосовой разговор, не чат.
- Живо и энергично. Ты — молодая девушка-менеджер, дружелюбная и профессиональная.
- На «ты», но уважительно. Как коллега, а не робот.
- Никакого маркдауна, звёздочек, форматирования. Только чистый текст для озвучки.
- Никаких «как AI-модель я не могу…» — ты представитель компании.

Твоя задача: квалифицировать лида за 2-4 минуты разговора.

Сценарий квалификации:
1. Познакомиться, узнать имя и компанию
2. Понять задачу: что нужно автоматизировать / какое AI-решение ищут
3. Оценить серьёзность: бюджет, сроки, кто принимает решение
4. Если лид перспективный — договориться о следующем шаге

Правила:
- НЕ перечисляй все услуги списком. Спрашивай, что нужно конкретно этому человеку.
- НЕ дави. Если человек не готов — вежливо заверши.
- НЕ придумывай цены. Скажи «обсудим на созвоне с тимлидом».
- Если спросят про опыт — у нас 5+ успешных AI-проектов за последний год.
- Завершай разговор за 10-12 реплик максимум."""

# ─────────────────── Data Structures ───────────────────
@dataclass
class Turn:
    """One conversation turn."""
    role: str  # "agent" or "user"
    text: str
    timestamp: float = field(default_factory=time.time)
    state: str = ""


@dataclass
class CallRecord:
    """Full call recording."""
    call_id: str
    started_at: float
    ended_at: Optional[float] = None
    turns: list[Turn] = field(default_factory=list)
    lead_qualified: Optional[bool] = None
    lead_summary: str = ""


# ─────────────────── Conversation Engine ───────────────────
class ConversationFlow:
    """Orchestrates the lead qualification conversation."""

    def __init__(self, call_id: Optional[str] = None):
        self.call_id = call_id or f"call_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        self.state = State.GREETING
        self.turn_count = 0
        self.call = CallRecord(
            call_id=self.call_id,
            started_at=time.time(),
        )

    def process_user_input(self, user_text: str) -> str:
        """
        Process user text through the conversation flow.
        Returns agent response text (ready for TTS).
        """
        if not user_text.strip():
            return self._idle_prompt()

        if self.state == State.ENDED:
            return ""

        # Record user turn
        self.turn_count += 1
        user_turn = Turn(role="user", text=user_text, state=self.state.value)
        self.call.turns.append(user_turn)

        # Transition state
        self._advance_state()

        # Auto-close if max turns reached
        if self.turn_count >= MAX_TURNS:
            self.state = State.CLOSE

        # Get agent response
        agent_text = self._get_llm_response(user_text)
        agent_turn = Turn(role="agent", text=agent_text, state=self.state.value)
        self.call.turns.append(agent_turn)

        # Save recording incrementally
        self._save_recording()

        return agent_text

    def start_call(self) -> str:
        """Generate the opening greeting. Call this first."""
        user_turn = Turn(role="user", text="[CALL STARTED]", state=State.GREETING.value)
        self.call.turns.append(user_turn)
        self.turn_count += 1

        agent_text = self._get_llm_response("[CALL STARTED]")
        agent_turn = Turn(role="agent", text=agent_text, state=State.GREETING.value)
        self.call.turns.append(agent_turn)

        self._advance_state()
        self._save_recording()
        return agent_text

    def end_call(self, qualified: Optional[bool] = None, summary: str = "") -> dict:
        """End the call, finalize recording, return summary."""
        self.state = State.ENDED
        self.call.ended_at = time.time()
        self.call.lead_qualified = qualified
        self.call.lead_summary = summary
        self._save_recording()
        return self.get_summary()

    def get_summary(self) -> dict:
        """Return call summary for dashboard/analytics."""
        duration = (self.call.ended_at or time.time()) - self.call.started_at
        user_turns = [t for t in self.call.turns if t.role == "user"]
        agent_turns = [t for t in self.call.turns if t.role == "agent"]
        return {
            "call_id": self.call_id,
            "duration_seconds": round(duration, 1),
            "turns": len(self.call.turns),
            "user_messages": len(user_turns),
            "agent_messages": len(agent_turns),
            "lead_qualified": self.call.lead_qualified,
            "lead_summary": self.call.lead_summary,
            "recording_path": str(self._recording_path()),
        }

    # ─── Internal ───

    def _advance_state(self):
        """Simple state machine: GREETING → QUALIFYING → DETAILS → CLOSE."""
        if self.state == State.GREETING and self.turn_count >= 2:
            self.state = State.QUALIFYING
        elif self.state == State.QUALIFYING and self.turn_count >= 5:
            self.state = State.DETAILS
        elif self.state == State.DETAILS and self.turn_count >= 8:
            self.state = State.CLOSE

    def _get_llm_response(self, user_text: str) -> str:
        """Call LLM via OpenRouter with the conversation context."""
        # Build messages with system prompt + state instruction
        state_instruction = STATE_QUESTIONS.get(self.state, "")
        system_content = f"{SYSTEM_PROMPT}\n\nТекущий этап: {self.state.value}. {state_instruction}"

        messages = [{"role": "system", "content": system_content}]

        # Include last 6 turns for context
        recent_turns = self.call.turns[-6:]
        for t in recent_turns:
            role = "assistant" if t.role == "agent" else "user"
            # Don't include system marker
            if t.text == "[CALL STARTED]":
                continue
            messages.append({"role": role, "content": t.text})

        # Add current user input if not already in turns
        if user_text != "[CALL STARTED]":
            messages.append({"role": "user", "content": user_text})

        try:
            resp = requests.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": messages,
                    "max_tokens": LLM_MAX_TOKENS,
                    "temperature": LLM_TEMPERATURE,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            # Graceful fallback — return templated response
            fallbacks = {
                State.GREETING: "Привет! Я Алиса, менеджер FocusRunner. С кем я говорю?",
                State.QUALIFYING: "Расскажите, пожалуйста, какой бизнес у вас и какие задачи хотите решить с помощью AI?",
                State.DETAILS: "Поняла. А какой бюджет и сроки вы рассматриваете?",
                State.CLOSE: "Спасибо за разговор! Я передам информацию команде, и с вами свяжутся в ближайшее время. Хорошего дня!",
            }
            print(f"[LLM] API error: {e} — using fallback response", flush=True)
            return fallbacks.get(self.state, "Извините, произошла ошибка. Давайте продолжим.")

    def _idle_prompt(self) -> str:
        """Prompt user when silent."""
        prompts = {
            State.GREETING: "Алло? Вы меня слышите?",
            State.QUALIFYING: "Я слушаю. Расскажите о вашем бизнесе.",
            State.DETAILS: "Продолжайте, пожалуйста.",
            State.CLOSE: "",
            State.ENDED: "",
        }
        return prompts.get(self.state, "")

    def _recording_path(self) -> Path:
        return RECORDINGS_DIR / f"{self.call_id}.jsonl"

    def _save_recording(self):
        """Save call recording as JSONL (append-only)."""
        record = {
            "call_id": self.call_id,
            "started_at": self.call.started_at,
            "ended_at": self.call.ended_at,
            "state": self.state.value,
            "turns": [{"role": t.role, "text": t.text, "state": t.state, "ts": t.timestamp} for t in self.call.turns],
            "lead_qualified": self.call.lead_qualified,
            "lead_summary": self.call.lead_summary,
        }
        self._recording_path().write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")


# ─────────────────── Demo / Test ───────────────────
def demo():
    """Run a simulated conversation to test the flow."""
    print("=" * 60)
    print("Conversation Flow Demo — Lead Qualification (Russian)")
    print("=" * 60)

    flow = ConversationFlow()

    # Start call
    greeting = flow.start_call()
    print(f"\n🤖 Агент: {greeting}")

    # Simulated dialogue
    simulated_inputs = [
        "Привет! Меня зовут Дмитрий, я владелец интернет-магазина.",
        "Хочу автоматизировать поддержку клиентов — слишком много однотипных вопросов.",
        "Бюджет есть, около 300 тысяч рублей. Нужно сделать за месяц.",
    ]

    for i, user_text in enumerate(simulated_inputs):
        print(f"\n👤 Клиент: {user_text}")
        response = flow.process_user_input(user_text)
        print(f"🤖 Агент: {response}")

    # End call
    summary = flow.end_call(qualified=True, summary="Интернет-магазин, автоматизация поддержки, бюджет 300к, срок 1 месяц.")
    print(f"\n{'=' * 60}")
    print("Call Summary:")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nRecording saved to: {flow._recording_path()}")


if __name__ == "__main__":
    demo()
