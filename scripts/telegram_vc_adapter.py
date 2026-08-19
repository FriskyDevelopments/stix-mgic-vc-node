#!/usr/bin/env python3
"""Long-lived stdio bridge from VC Node to a Telegram group call.

One JSON object per input line, one JSON result per output line.  The process owns the
MTProto + WebRTC state, so a call survives the HTTP request that started it.  It never
prints credentials, phone numbers, or session material.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from telethon.sync import TelegramClient


def output(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


class Adapter:
    def __init__(self) -> None:
        self.client: TelegramClient | None = None
        self.calls: Any = None
        self.chat_id: int | None = None
        self.source: str | None = None

    def ensure_client(self, start_calls: bool = True) -> None:
        """Connect MTProto on demand; only start the call engine when required."""
        if not self.client:
            api_id = int(os.environ["STIX_TELEGRAM_API_ID"])
            api_hash = os.environ["STIX_TELEGRAM_API_HASH"]
            session = os.environ.get("STIX_MTPROTO_SESSION_PATH", "/data/mtproto/operator")
            client = TelegramClient(session, api_id, api_hash)
            client.connect()
            if not client.is_user_authorized():
                client.disconnect()
                raise RuntimeError("Telegram operator has not been paired")
            self.client = client
        if start_calls and not self.calls:
            from pytgcalls import PyTgCalls
            self.calls = PyTgCalls(self.client)
            self.calls.start()

    def status(self) -> dict[str, Any]:
        paired = False
        try:
            self.ensure_client(start_calls=False)
            paired = True
        except Exception:
            paired = False
        return {"paired": paired, "active": self.chat_id is not None, "chatId": self.chat_id, "source": self.source}

    def join(self, chat_id: str, source: str) -> dict[str, Any]:
        if not source.strip():
            raise RuntimeError("Choose an RTMP URL or media source before going live")
        self.ensure_client()
        numeric_chat_id = int(chat_id)
        self.calls.play(numeric_chat_id, source)
        self.chat_id = numeric_chat_id
        self.source = source
        return self.status()

    def leave(self) -> dict[str, Any]:
        if self.calls and self.chat_id is not None:
            self.calls.leave_call(self.chat_id)
        self.chat_id = None
        self.source = None
        return self.status()

    def switch_source(self, source: str) -> dict[str, Any]:
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        if not source.strip():
            raise RuntimeError("Media source is required")
        self.calls.play(self.chat_id, source)
        self.source = source
        return self.status()

    def groups(self) -> dict[str, Any]:
        """Return only call-capable group/channel metadata, never private dialogs."""
        self.ensure_client(start_calls=False)
        groups: list[dict[str, str]] = []
        assert self.client is not None
        for dialog in self.client.iter_dialogs():
            entity = dialog.entity
            is_group = bool(dialog.is_group)
            is_channel = bool(dialog.is_channel and getattr(entity, "megagroup", False))
            if not (is_group or is_channel):
                continue
            groups.append({
                "id": str(dialog.id),
                "title": str(dialog.name or "Untitled Telegram group")[:120],
                "kind": "channel" if is_channel else "group",
            })
            if len(groups) >= 75:
                break
        return {"groups": groups}


adapter = Adapter()

for line in sys.stdin:
    try:
        request = json.loads(line)
        action = request.get("action")
        if action == "status":
            result = adapter.status()
        elif action == "join":
            result = adapter.join(str(request.get("chatId", "")), str(request.get("source", "")))
        elif action == "leave":
            result = adapter.leave()
        elif action == "source":
            result = adapter.switch_source(str(request.get("source", "")))
        elif action == "groups":
            result = adapter.groups()
        else:
            raise RuntimeError("Unknown Telegram VC action")
        output({"ok": True, "result": result})
    except Exception as error:
        # Errors are intentionally generic at this boundary.  Detailed SDK errors can
        # contain peer metadata and should remain only in the private process stderr.
        output({"ok": False, "error": str(error)[:240]})
