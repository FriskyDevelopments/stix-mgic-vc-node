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

try:
    from telethon import functions, types, utils
    from telethon.sync import TelegramClient
except ImportError:
    functions = None  # type: ignore
    types = None  # type: ignore
    utils = None  # type: ignore
    TelegramClient = None  # type: ignore


def output(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


class AdapterError(RuntimeError):
    """A safe, user-facing error that contains no SDK/session details."""
    pass


class Adapter:
    def __init__(self) -> None:
        self.client: Any = None
        self.calls: Any = None
        self.chat_id: int | None = None
        self.source: str | None = None
        self.camera: bool = False
        self.paused: bool = False
        # Local overlay until phone.GetGroupParticipants is wired for room-admin paths.
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
        return {
            "paired": paired,
            "active": self.chat_id is not None,
            "chatId": self.chat_id,
            "source": self.source,
            "camera": self.camera,
            "paused": self.paused,
        }

    def join(self, chat_id: str, source: str, camera: bool = True) -> dict[str, Any]:
        if not source.strip():
            raise AdapterError("Choose an RTMP URL or media source before going live")
        self.ensure_client()
        numeric_chat_id = int(chat_id)
        camera_on = False
        if camera:
            stream = source
            try:
                from pytgcalls.types import AudioVideoPiped
                stream = AudioVideoPiped(source)
                camera_on = True
            except ImportError:
                stream = source
                camera_on = False
            self.calls.play(numeric_chat_id, stream)
        else:
            self.calls.play(numeric_chat_id, source)
        self.chat_id = numeric_chat_id
        self.source = source
        self.camera = camera_on
        self.paused = False
        return self.status()

    def leave(self) -> dict[str, Any]:
        if self.calls and self.chat_id is not None:
            try:
                self.calls.leave_call(self.chat_id)
            except Exception:
                pass
        self.chat_id = None
        self.source = None
        self.camera = False
        self.paused = False
        self._participant_overlay.clear()
        self._call_title = None
        return self.status()

    def switch_source(self, source: str) -> dict[str, Any]:
        if self.chat_id is None:
            raise AdapterError("Join a Telegram group call first")
        if not source.strip():
            raise AdapterError("Media source is required")
        self.calls.play(self.chat_id, source)
        self.source = source
        self.paused = False
        return self.status()

    def pause(self) -> dict[str, Any]:
        if self.chat_id is None:
            raise AdapterError("Join a Telegram group call first")
        if self.calls:
            for method_name in ("pause_stream", "pause"):
                fn = getattr(self.calls, method_name, None)
                if callable(fn):
                    try:
                        fn(self.chat_id)
                        break
                    except Exception:
                        pass
        self.paused = True
        return self.status()

    def resume(self) -> dict[str, Any]:
        if self.chat_id is None:
            raise AdapterError("Join a Telegram group call first")
        if self.calls:
            for method_name in ("resume_stream", "resume"):
                fn = getattr(self.calls, method_name, None)
                if callable(fn):
                    try:
                        fn(self.chat_id)
                        break
                    except Exception:
                        pass
        self.paused = False
        return self.status()

    def skip(self) -> dict[str, Any]:
        if self.chat_id is None:
            raise AdapterError("Join a Telegram group call first")
        # Placeholder: playlist pointer advance happens in Node scheduler for now.
        # We can leave current or stop; actual next is driven by POST /skip + playlist.
        return self.status()

    def stop(self) -> dict[str, Any]:
        return self.leave()

    def set_camera(self, on: bool) -> dict[str, Any]:
        if self.chat_id is None:
            raise AdapterError("Join a Telegram group call first")
        if not self.source:
            raise AdapterError("No media source is active for camera changes")
        if on:
            try:
                from pytgcalls.types import AudioVideoPiped
                self.calls.play(self.chat_id, AudioVideoPiped(self.source))
            except ImportError as error:
                raise AdapterError("Camera output is not available in this Telegram build") from error
            except Exception as error:
                raise AdapterError("Could not enable camera on the Telegram call") from error
            self.camera = True
        else:
            try:
                self.calls.play(self.chat_id, self.source)
            except Exception as error:
                raise AdapterError("Could not disable camera on the Telegram call") from error
            self.camera = False
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
        if types and isinstance(entity, types.Channel):
            full = self.client(functions.channels.GetFullChannelRequest(channel=entity))
        elif types and isinstance(entity, types.Chat):
            full = self.client(functions.messages.GetFullChatRequest(chat_id=entity.id))
        else:
            raise AdapterError("Choose a Telegram group")
        fresh = next((chat for chat in full.chats if utils.get_peer_id(chat) == utils.get_peer_id(entity)), None)
        if fresh is None:
            raise AdapterError("Telegram group permissions could not be verified")
        call = getattr(full.full_chat, "call", None)
        if call is None:
            raise AdapterError("No active Telegram voice chat")
        return fresh, full.full_chat, call

    def _admin_ids(self, entity: Any, full_chat: Any) -> set[str]:
        assert self.client is not None
        if types and isinstance(entity, types.Channel):
            admins = self.client.iter_participants(entity, filter=types.ChannelParticipantsAdmins())
            return {str(utils.get_peer_id(admin)) for admin in admins}
        members = getattr(getattr(full_chat, "participants", None), "participants", [])
        return {str(member.user_id) for member in members if types and isinstance(member, (types.ChatParticipantAdmin, types.ChatParticipantCreator))}

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

    def participants_live(self, chat_id: str) -> dict[str, Any]:
        entity, full_chat, call = self._resolve_call(chat_id)
        members, peers, complete = self._collect_participants(call)
        try:
            admin_ids = self._admin_ids(entity, full_chat)
        except Exception:
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
            result.append({
                "id": participant_id,
                "name": name[:120],
                "muted": bool(getattr(member, "muted", False)),
                "cameraOn": camera_on,
                "isSelf": is_self,
                "isAdmin": participant_id in admin_ids or (is_self and can_manage),
            })
        return {
            "chatId": str(utils.get_peer_id(fresh_entity)),
            "callId": str(call.id),
            "participants": result,
            "complete": complete,
            "canManageCalls": can_manage,
        }

    def mute_live(self, chat_id: str, participant_id: str, expected_call_id: str, only_if_camera_off: bool = False) -> dict[str, Any]:
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
        entity, _, current_call = self._resolve_call(chat_id)
        if str(current_call.id) != expected_call_id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        if not self._can_manage_calls(entity):
            raise AdapterError("The Telegram operator needs Manage video chats permission")
        fresh = self.participants_live(chat_id)
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
        snapshot = self.participants_live(chat_id)
        if snapshot["callId"] != expected_call_id:
            raise AdapterError("The Telegram voice chat changed. Refresh participants")
        confirmed = next((member for member in snapshot["participants"] if member["id"] == participant_id), None)
        if not confirmed or not confirmed["muted"]:
            raise AdapterError("Telegram has not confirmed the mute. Refresh participants")
        return {**snapshot, "participantId": participant_id, "confirmed": True}

    def kick_live(self, chat_id: str, participant_id: str) -> dict[str, Any]:
        entity, _, _ = self._resolve_call(chat_id)
        if not self._can_manage_calls(entity):
            raise AdapterError("The Telegram operator needs Manage video chats permission")
        assert self.client is not None
        peer = self.client.get_input_entity(int(participant_id))
        fn = getattr(self.client, "kick_participant", None)
        if not callable(fn):
            raise AdapterError("Kick is not available in this Telegram build")
        try:
            fn(entity, peer)
        except Exception as error:
            raise AdapterError("Telegram did not confirm the kick. Refresh participants") from error
        return {"chatId": chat_id, "participantId": participant_id, "kicked": True}

    def pin_live(self, chat_id: str, message_id: Any) -> dict[str, Any]:
        entity, _, _ = self._resolve_call(chat_id)
        assert self.client is not None
        fn = getattr(self.client, "pin_message", None)
        if not callable(fn):
            raise AdapterError("Pin is not available in this Telegram build")
        try:
            fn(entity, int(message_id))
        except Exception as error:
            raise AdapterError("Telegram did not confirm the pin") from error
        return {"chatId": chat_id, "pinned": True}



    def participants(self) -> dict[str, Any]:
        """Return call participants when MTProto mapping lands; empty overlay until then."""
        if self.chat_id is None:
            raise AdapterError("Join a Telegram group call first")
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
            raise AdapterError("Join a Telegram group call first")
        if not target.strip():
            raise AdapterError("target user id is required")
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
            raise AdapterError("Join a Telegram group call first")
        if not target.strip():
            raise AdapterError("target user id is required")
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
            raise AdapterError("Join a Telegram group call first")
        cleaned = title.strip()
        if not cleaned:
            raise AdapterError("title is required")
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
            raise AdapterError("Join a Telegram group call first")
        if not target.strip():
            raise AdapterError("invite target username/id is required")
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
            raise AdapterError("Join a Telegram group call first")
        if not target.strip():
            raise AdapterError("target user id is required")
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



def process_line(adapter: Adapter, line: str) -> None:
    """Process exactly one JSON request line and emit exactly one reply."""
    request_id = None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        action = request.get("action")
        if action == "status":
            result = adapter.status()
        elif action == "join":
            cam = request.get("camera", True)
            camera_enabled = cam if isinstance(cam, bool) else str(cam).lower() != "false"
            result = adapter.join(
                str(request.get("chatId", "")),
                str(request.get("source", "")),
                camera=camera_enabled,
            )
        elif action == "leave":
            result = adapter.leave()
        elif action == "source":
            result = adapter.switch_source(str(request.get("source", "")))
        elif action == "pause":
            result = adapter.pause()
        elif action == "resume":
            result = adapter.resume()
        elif action == "skip":
            result = adapter.skip()
        elif action == "stop":
            result = adapter.stop()
        elif action == "cam":
            result = adapter.set_camera(request.get("on") is True or request.get("on") == "true")
        elif action == "groups":
            result = adapter.groups()
        elif action == "participants":
            chat_id = str(request.get("chatId", "") or "").strip()
            if chat_id:
                result = adapter.participants_live(chat_id)
            else:
                result = adapter.participants()
        elif action == "mute":
            chat_id = str(request.get("chatId", "") or "").strip()
            participant_id = str(request.get("participantId", "") or "").strip()
            if chat_id and participant_id:
                result = adapter.mute_live(
                    chat_id,
                    participant_id,
                    str(request.get("expectedCallId", "")),
                    request.get("onlyIfCameraOff") == "true" or request.get("onlyIfCameraOff") is True,
                )
            else:
                result = adapter.mute(str(request.get("target", "") or participant_id))
        elif action == "unmute":
            result = adapter.unmute(str(request.get("target", "")))
        elif action == "kick":
            chat_id = str(request.get("chatId", "") or "").strip()
            participant_id = str(request.get("participantId", "") or "").strip()
            if chat_id and participant_id:
                result = adapter.kick_live(chat_id, participant_id)
            else:
                result = adapter.kick(str(request.get("target", "") or participant_id))
        elif action == "pin":
            chat_id = str(request.get("chatId", "") or "").strip()
            if chat_id and ("messageId" in request):
                result = adapter.pin_live(chat_id, request.get("messageId", 0))
            else:
                result = adapter.pin(str(request.get("target", "")))
        elif action == "end":
            result = adapter.end()
        elif action == "title":
            result = adapter.title(str(request.get("title", "")))
        elif action == "invite":
            result = adapter.invite(str(request.get("target", "")))
        else:
            raise RuntimeError("Unknown Telegram VC action")
        output({"id": request_id, "ok": True, "result": result})
    except Exception as error:
        # Errors are intentionally generic at this boundary.
        message = str(error) if isinstance(error, AdapterError) else "Telegram could not complete that action. Refresh and try again"
        output({"id": request_id, "ok": False, "error": message[:240]})


def main() -> None:
    """Robust stdio loop: explicit buffer on binary stdin, split on \n, exactly one reply per line."""
    adapter = Adapter()
    buffer = b""
    while True:
        try:
            chunk = os.read(sys.stdin.fileno(), 4096)
        except (OSError, ValueError):
            break
        if not chunk:
            if buffer.strip():
                line = buffer.decode("utf-8", errors="replace").strip()
                if line:
                    process_line(adapter, line)
            break
        buffer += chunk
        while b"\n" in buffer:
            raw_line, buffer = buffer.split(b"\n", 1)
            line = raw_line.decode("utf-8", errors="replace").strip()
            if line:
                process_line(adapter, line)


if __name__ == "__main__":
    main()
