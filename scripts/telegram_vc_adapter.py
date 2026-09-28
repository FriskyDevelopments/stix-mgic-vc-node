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

from telethon import functions, types, utils
from telethon.sync import TelegramClient


def output(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


class AdapterError(RuntimeError):
    """A safe, user-facing error that contains no SDK/session details."""


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
                raise AdapterError("Telegram operator has not been paired")
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
            raise AdapterError("Choose an RTMP URL or media source before going live")
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
            raise AdapterError("Join a Telegram group call first")
        if not source.strip():
            raise AdapterError("Media source is required")
        self.calls.play(self.chat_id, source)
        self.source = source
        return self.status()

    def groups(self) -> dict[str, Any]:
        """Return only call-capable group/channel metadata, never private dialogs."""
        self.ensure_client(start_calls=False)
        groups: list[dict[str, Any]] = []
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
                "canManageCalls": self._can_manage_calls(entity),
            })
            if len(groups) >= 75:
                break
        return {"groups": groups}


    @staticmethod
    def _can_manage_calls(entity: Any) -> bool:
        return bool(getattr(entity, "creator", False) or getattr(getattr(entity, "admin_rights", None), "manage_call", False))

    def _resolve_call(self, chat_id: str) -> tuple[Any, Any, Any]:
        """Resolve the active call and operator rights afresh, never from play state."""
        self.ensure_client(start_calls=False)
        assert self.client is not None
        entity = self.client.get_entity(int(chat_id))
        if isinstance(entity, types.Channel):
            full = self.client(functions.channels.GetFullChannelRequest(channel=entity))
        elif isinstance(entity, types.Chat):
            full = self.client(functions.messages.GetFullChatRequest(chat_id=entity.id))
        else:
            raise AdapterError("Choose a Telegram group")
        # get_entity can use cached entities; use the full response for current rights.
        fresh = next((chat for chat in full.chats if utils.get_peer_id(chat) == utils.get_peer_id(entity)), None)
        if fresh is None:
            raise AdapterError("Telegram group permissions could not be verified")
        call = getattr(full.full_chat, "call", None)
        if call is None:
            raise AdapterError("No active Telegram voice chat")
        return fresh, full.full_chat, call

    def _admin_ids(self, entity: Any, full_chat: Any) -> set[str]:
        assert self.client is not None
        if isinstance(entity, types.Channel):
            admins = self.client.iter_participants(entity, filter=types.ChannelParticipantsAdmins())
            return {str(utils.get_peer_id(admin)) for admin in admins}
        members = getattr(getattr(full_chat, "participants", None), "participants", [])
        return {str(member.user_id) for member in members if isinstance(member, (types.ChatParticipantAdmin, types.ChatParticipantCreator))}

    def _collect_participants(self, call: Any) -> tuple[dict[str, Any], dict[str, Any], bool]:
        assert self.client is not None
        participants: dict[str, Any] = {}
        peers: dict[str, Any] = {}
        offset = ""
        offsets: set[str] = set()
        versions: set[int] = set()
        counts: set[int] = set()
        complete = False
        reliable = True
        for _ in range(20):
            try:
                page = self.client(functions.phone.GetGroupParticipantsRequest(call=call, ids=[], sources=[], offset=offset, limit=100))
            except Exception:
                if not offsets:
                    raise AdapterError("Telegram participants could not be loaded") from None
                break
            for peer in [*page.users, *page.chats]:
                peers[str(utils.get_peer_id(peer))] = peer
            for participant in page.participants:
                if getattr(participant, "min", False):
                    reliable = False
                participant_id = str(utils.get_peer_id(participant.peer))
                if getattr(participant, "left", False):
                    participants.pop(participant_id, None)
                else:
                    participants[participant_id] = participant
            version = getattr(page, "version", None)
            count = getattr(page, "count", None)
            if isinstance(version, int):
                versions.add(version)
            else:
                reliable = False
            if isinstance(count, int):
                counts.add(count)
            else:
                reliable = False
            next_offset = getattr(page, "next_offset", None)
            if next_offset == "":
                complete = reliable and len(versions) == 1 and len(counts) == 1 and len(participants) >= next(iter(counts))
                break
            if not isinstance(next_offset, str) or next_offset in offsets or next_offset == offset:
                break
            offsets.add(next_offset)
            offset = next_offset
        return participants, peers, complete

    def participants(self, chat_id: str) -> dict[str, Any]:
        entity, full_chat, call = self._resolve_call(chat_id)
        members, peers, complete = self._collect_participants(call)
        try:
            admin_ids = self._admin_ids(entity, full_chat)
        except Exception:
            # Unknown admin membership is not safe for automatic camera moderation.
            raise AdapterError("Telegram participant roles could not be verified") from None
        fresh_entity, _, fresh_call = self._resolve_call(chat_id)
        if fresh_call.id != call.id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        can_manage = self._can_manage_calls(fresh_entity)
        result = []
        for participant_id, member in members.items():
            peer = peers.get(participant_id)
            name = getattr(peer, "title", None) or " ".join(filter(None, [getattr(peer, "first_name", None), getattr(peer, "last_name", None)])) or "Telegram participant"
            video = getattr(member, "video", None)
            camera_on = not bool(getattr(video, "paused", False)) if video is not None else (False if complete else None)
            is_self = bool(getattr(member, "self", False))
            result.append({"id": participant_id, "name": name[:120], "muted": bool(getattr(member, "muted", False)), "cameraOn": camera_on,
                           "isSelf": is_self, "isAdmin": participant_id in admin_ids or (is_self and can_manage)})
        return {"chatId": str(utils.get_peer_id(fresh_entity)), "callId": str(call.id), "participants": result, "complete": complete, "canManageCalls": can_manage}

    def mute(self, chat_id: str, participant_id: str, expected_call_id: str, only_if_camera_off: bool = False) -> dict[str, Any]:
        entity, _, call = self._resolve_call(chat_id)
        if str(call.id) != expected_call_id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        if not self._can_manage_calls(entity):
            raise AdapterError("The Telegram operator needs Manage video chats permission")
        assert self.client is not None
        peer = self.client.get_input_entity(int(participant_id))
        membership = self.client(functions.phone.GetGroupParticipantsRequest(call=call, ids=[peer], sources=[], offset="", limit=1))
        target = next((member for member in membership.participants if str(utils.get_peer_id(member.peer)) == participant_id and not getattr(member, "left", False)), None)
        if target is None:
            raise AdapterError("This participant has left the Telegram voice chat")
        # Recheck after peer resolution/member lookup, immediately before the mutation.
        entity, _, current_call = self._resolve_call(chat_id)
        if str(current_call.id) != expected_call_id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        if not self._can_manage_calls(entity):
            raise AdapterError("The Telegram operator needs Manage video chats permission")
        # A queued moderation request may outlive the camera state or role that
        # prompted it. Re-read both immediately before sending the mute RPC.
        fresh = self.participants(chat_id)
        if fresh["callId"] != expected_call_id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        if not fresh["canManageCalls"]:
            raise AdapterError("The Telegram operator needs Manage video chats permission")
        current_member = next((member for member in fresh["participants"] if member["id"] == participant_id), None)
        if current_member is None:
            raise AdapterError("This participant has left the Telegram voice chat")
        if current_member["isSelf"] or current_member["isAdmin"]:
            raise AdapterError("Administrators and the connected Telegram account are exempt from moderation")
        if only_if_camera_off and (not fresh["complete"] or current_member["cameraOn"] is not False):
            raise AdapterError("Camera state changed or could not be verified. The microphone was not muted")
        if not current_member["muted"]:
            self.client(functions.phone.EditGroupCallParticipantRequest(call=current_call, participant=peer, muted=True))
        snapshot = self.participants(chat_id)
        if snapshot["callId"] != expected_call_id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        confirmed = next((member for member in snapshot["participants"] if member["id"] == participant_id), None)
        if not confirmed or not confirmed["muted"]:
            raise AdapterError("Telegram has not confirmed the mute. Refresh participants")
        return {**snapshot, "participantId": participant_id, "confirmed": True}


def main() -> None:
    adapter = Adapter()
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
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
                result = adapter.participants(str(request.get("chatId", "")))
            elif action == "mute":
                result = adapter.mute(str(request.get("chatId", "")), str(request.get("participantId", "")), str(request.get("expectedCallId", "")), request.get("onlyIfCameraOff") == "true")
            else:
                raise AdapterError("Unknown Telegram VC action")
            output({"id": request_id, "ok": True, "result": result})
        except Exception as error:
            # SDK errors may include peer/session material; only our own errors are public.
            message = str(error) if isinstance(error, AdapterError) else "Telegram could not complete that action. Refresh and try again"
            output({"id": request_id, "ok": False, "error": message[:240]})


if __name__ == "__main__":
    main()
