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
        # Local overlay until phone.GetGroupParticipants is wired.
        self._participant_overlay: dict[str, dict[str, Any]] = {}
        self._call_title: str | None = None

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
        self._participant_overlay.clear()
        self._call_title = None
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


    def participants(self) -> dict[str, Any]:
        """Return call participants when MTProto mapping lands; empty overlay until then."""
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        # PENDING MTProto: phone.GetGroupCall + phone.GetGroupParticipants
        return {
            "participants": list(self._participant_overlay.values()),
            "count": len(self._participant_overlay),
            "pendingMtproto": "phone.GetGroupCall / phone.GetGroupParticipants",
            "active": True,
            "chatId": self.chat_id,
            "source": self.source,
            "title": self._call_title,
        }

    def mute(self, target: str) -> dict[str, Any]:
        return self._admin_participant("mute", target, muted=True)

    def unmute(self, target: str) -> dict[str, Any]:
        return self._admin_participant("unmute", target, muted=False)

    def kick(self, target: str) -> dict[str, Any]:
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        if not target.strip():
            raise RuntimeError("target user id is required")
        # PENDING MTProto: phone.EditGroupCallParticipant(left=True) / remove
        self._participant_overlay.pop(target, None)
        return {
            "participants": list(self._participant_overlay.values()),
            "count": len(self._participant_overlay),
            "pendingMtproto": "phone.EditGroupCallParticipant remove / kick",
            "active": True,
            "chatId": self.chat_id,
            "source": self.source,
            "title": self._call_title,
        }

    def pin(self, target: str) -> dict[str, Any]:
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        if not target.strip():
            raise RuntimeError("target user id is required")
        # PENDING MTProto: raise video source / set primary presentation
        for pid, row in self._participant_overlay.items():
            row["pinned"] = pid == target
        if target not in self._participant_overlay:
            self._participant_overlay[target] = {
                "id": target,
                "name": f"User {target}",
                "muted": False,
                "pinned": True,
                "speaking": False,
            }
        return {
            "participants": list(self._participant_overlay.values()),
            "count": len(self._participant_overlay),
            "pendingMtproto": "pin primary video/screen source",
            "active": True,
            "chatId": self.chat_id,
            "source": self.source,
            "title": self._call_title,
        }

    def end(self) -> dict[str, Any]:
        """End maps to leave_call today; discard GroupCall MTProto still pending."""
        status = self.leave()
        self._participant_overlay.clear()
        self._call_title = None
        return {
            "participants": [],
            "count": 0,
            "pendingMtproto": "phone.DiscardGroupCall (leave_call used as stand-in)",
            "active": False,
            "chatId": None,
            "source": None,
            "title": None,
            **{k: status.get(k) for k in ("paired",) if k in status},
        }

    def title(self, title: str) -> dict[str, Any]:
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        cleaned = title.strip()
        if not cleaned:
            raise RuntimeError("title is required")
        # PENDING MTProto: phone.EditGroupCall(title=...)
        self._call_title = cleaned[:128]
        return {
            "participants": list(self._participant_overlay.values()),
            "count": len(self._participant_overlay),
            "pendingMtproto": "phone.EditGroupCall title",
            "active": True,
            "chatId": self.chat_id,
            "source": self.source,
            "title": self._call_title,
        }

    def invite(self, target: str) -> dict[str, Any]:
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        if not target.strip():
            raise RuntimeError("invite target username/id is required")
        # PENDING MTProto: messages.AddChatUser / InviteToChannel / importChatInvite
        return {
            "participants": list(self._participant_overlay.values()),
            "count": len(self._participant_overlay),
            "pendingMtproto": "invite via messages.AddChatUser / InviteToChannel",
            "active": True,
            "chatId": self.chat_id,
            "source": self.source,
            "title": self._call_title,
        }

    def _admin_participant(self, action: str, target: str, *, muted: bool) -> dict[str, Any]:
        if self.chat_id is None:
            raise RuntimeError("Join a Telegram group call first")
        if not target.strip():
            raise RuntimeError("target user id is required")
        # PENDING MTProto: phone.EditGroupCallParticipant(muted=...)
        row = self._participant_overlay.get(target) or {
            "id": target,
            "name": f"User {target}",
            "muted": muted,
            "pinned": False,
            "speaking": False,
        }
        row = {**row, "muted": muted, "speaking": False if muted else row.get("speaking", False)}
        self._participant_overlay[target] = row
        return {
            "participants": list(self._participant_overlay.values()),
            "count": len(self._participant_overlay),
            "pendingMtproto": f"phone.EditGroupCallParticipant ({action})",
            "active": True,
            "chatId": self.chat_id,
            "source": self.source,
            "title": self._call_title,
        }



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
        elif action == "participants":
            result = adapter.participants()
        elif action == "mute":
            result = adapter.mute(str(request.get("target", "")))
        elif action == "unmute":
            result = adapter.unmute(str(request.get("target", "")))
        elif action == "kick":
            result = adapter.kick(str(request.get("target", "")))
        elif action == "pin":
            result = adapter.pin(str(request.get("target", "")))
        elif action == "end":
            result = adapter.end()
        elif action == "title":
            result = adapter.title(str(request.get("title", "")))
        elif action == "invite":
            result = adapter.invite(str(request.get("target", "")))
        else:
            raise RuntimeError("Unknown Telegram VC action")
        output({"ok": True, "result": result})
    except Exception as error:
        # Errors are intentionally generic at this boundary.  Detailed SDK errors can
        # contain peer metadata and should remain only in the private process stderr.
        output({"ok": False, "error": str(error)[:240]})
