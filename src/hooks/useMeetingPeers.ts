import { useEffect, useRef, useState } from "react";
import Peer, { MediaConnection, DataConnection } from "peerjs";

export interface RemoteParticipant {
  id: string;
  name: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
}

type PeerMessage =
  | { type: "hello"; name: string; isMuted: boolean; isCameraOn: boolean }
  | { type: "state"; name: string; isMuted: boolean; isCameraOn: boolean }
  | { type: "peer-list"; peers: string[] };

interface Options {
  meetingId: string;
  localStream: MediaStream | null;
  localName: string;
  isMicOn: boolean;
  isCameraOn: boolean;
  enabled?: boolean;
}

/**
 * Mesh WebRTC hook using PeerJS public signaling server.
 *
 * Topology: one peer in the room is the "anchor" (deterministic id
 * `tradus-<meetingId>-anchor`). The first user to arrive claims the
 * anchor id; subsequent users pick a random id and open a data channel
 * to the anchor. The anchor broadcasts the list of peers; every peer
 * then opens a media call to the others. To avoid double-calls, only
 * the peer with the lexicographically smaller id dials.
 */
export const useMeetingPeers = ({
  meetingId,
  localStream,
  localName,
  isMicOn,
  isCameraOn,
  enabled = true,
}: Options) => {
  const [remotes, setRemotes] = useState<Record<string, RemoteParticipant>>({});
  const [myPeerId, setMyPeerId] = useState<string>("");

  // Keep latest values accessible inside async callbacks without stale closures
  const localStreamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef({ isMicOn, isCameraOn, localName });
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  useEffect(() => {
    stateRef.current = { isMicOn, isCameraOn, localName };
  }, [isMicOn, isCameraOn, localName]);

  const peerRef = useRef<Peer | null>(null);
  const mediaConnsRef = useRef<Map<string, MediaConnection>>(new Map());
  const dataConnsRef = useRef<Map<string, DataConnection>>(new Map());
  const anchorConnRef = useRef<DataConnection | null>(null);
  const isAnchorRef = useRef(false);
  const knownPeersRef = useRef<Set<string>>(new Set());
  const pendingOutgoingCallsRef = useRef<Set<string>>(new Set());
  const pendingIncomingCallsRef = useRef<MediaConnection[]>([]);

  useEffect(() => {
    if (!enabled || !meetingId) return;

    const namespace = `tradus-${meetingId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const anchorId = `${namespace}-anchor`;
    let destroyed = false;

    const upsertRemote = (
      peerId: string,
      patch: Partial<RemoteParticipant>
    ) => {
      setRemotes((prev) => {
        const existing = prev[peerId];
        return {
          ...prev,
          [peerId]: {
            id: peerId,
            name: existing?.name ?? peerId.slice(-6),
            stream: existing?.stream ?? null,
            isMuted: existing?.isMuted ?? false,
            isCameraOn: existing?.isCameraOn ?? true,
            ...patch,
          },
        };
      });
    };

    const removeRemote = (peerId: string) => {
      setRemotes((prev) => {
        if (!prev[peerId]) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    const sendState = (conn: DataConnection) => {
      try {
        const msg: PeerMessage = {
          type: "state",
          name: stateRef.current.localName,
          isMuted: !stateRef.current.isMicOn,
          isCameraOn: stateRef.current.isCameraOn,
        };
        conn.send(msg);
      } catch {
        /* ignore */
      }
    };

    const attachDataConn = (conn: DataConnection) => {
      dataConnsRef.current.set(conn.peer, conn);

      conn.on("open", () => {
        const hello: PeerMessage = {
          type: "hello",
          name: stateRef.current.localName,
          isMuted: !stateRef.current.isMicOn,
          isCameraOn: stateRef.current.isCameraOn,
        };
        try {
          conn.send(hello);
        } catch {
          /* ignore */
        }

        // Anchor tracks this peer and broadcasts the new list.
        if (isAnchorRef.current) {
          knownPeersRef.current.add(conn.peer);
          broadcastPeerList();
        }

        // Whichever side has the lexicographically smaller id initiates the
        // media call. This covers both anchor↔joiner and joiner↔joiner pairs
        // without double-dialing.
        const me = peerRef.current?.id;
        if (
          me &&
          me < conn.peer &&
          !mediaConnsRef.current.has(conn.peer)
        ) {
          dialMedia(conn.peer);
        }
      });

      conn.on("data", (raw) => {
        const msg = raw as PeerMessage;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "hello" || msg.type === "state") {
          upsertRemote(conn.peer, {
            name: msg.name,
            isMuted: msg.isMuted,
            isCameraOn: msg.isCameraOn,
          });
        } else if (msg.type === "peer-list") {
          handlePeerList(msg.peers);
        }
      });

      conn.on("close", () => {
        dataConnsRef.current.delete(conn.peer);
        if (isAnchorRef.current) {
          knownPeersRef.current.delete(conn.peer);
          broadcastPeerList();
        }
        const mc = mediaConnsRef.current.get(conn.peer);
        if (mc) {
          mc.close();
          mediaConnsRef.current.delete(conn.peer);
        }
        removeRemote(conn.peer);
      });

      conn.on("error", () => {
        /* ignore */
      });
    };

    const broadcastPeerList = () => {
      if (!isAnchorRef.current || !peerRef.current) return;
      const peers = [peerRef.current.id, ...knownPeersRef.current];
      const msg: PeerMessage = { type: "peer-list", peers };
      dataConnsRef.current.forEach((c) => {
        try {
          c.send(msg);
        } catch {
          /* ignore */
        }
      });
    };

    const handlePeerList = (peers: string[]) => {
      const me = peerRef.current?.id;
      if (!me) return;
      peers.forEach((p) => {
        if (p === me) return;
        // Ensure a data connection exists (used for state updates).
        if (!dataConnsRef.current.has(p) && p !== anchorId) {
          const dc = peerRef.current!.connect(p, { reliable: true });
          attachDataConn(dc);
        }
        // Dial media if we own the "smaller" id.
        if (!mediaConnsRef.current.has(p) && me < p) {
          dialMedia(p);
        }
      });
    };

    const dialMedia = (remoteId: string) => {
      const stream = localStreamRef.current;
      if (!stream) {
        pendingOutgoingCallsRef.current.add(remoteId);
        return;
      }
      pendingOutgoingCallsRef.current.delete(remoteId);
      try {
        const call = peerRef.current!.call(remoteId, stream);
        attachMediaConn(call);
      } catch {
        /* ignore */
      }
    };

    const attachMediaConn = (call: MediaConnection) => {
      mediaConnsRef.current.set(call.peer, call);
      call.on("stream", (remoteStream) => {
        upsertRemote(call.peer, { stream: remoteStream });
      });
      call.on("close", () => {
        mediaConnsRef.current.delete(call.peer);
        upsertRemote(call.peer, { stream: null });
      });
      call.on("error", () => {
        /* ignore */
      });
    };

    const startAsAnchor = () => {
      const peer = new Peer(anchorId, { debug: 0 });
      peerRef.current = peer;

      peer.on("open", (id) => {
        if (destroyed) {
          peer.destroy();
          return;
        }
        isAnchorRef.current = true;
        setMyPeerId(id);
      });

      peer.on("error", (err) => {
        const isTaken =
          (err as { type?: string }).type === "unavailable-id" ||
          String(err?.message || "").includes("is taken");
        if (isTaken && !peerRef.current?.destroyed) {
          peer.destroy();
          peerRef.current = null;
          startAsJoiner();
        } else {
          console.warn("[peer anchor] error", err);
        }
      });

      peer.on("connection", (conn) => {
        attachDataConn(conn);
      });
      peer.on("call", (call) => {
        const stream = localStreamRef.current;
        if (stream) {
          call.answer(stream);
          attachMediaConn(call);
        } else {
          // Wait for local stream before answering so the other side gets media.
          pendingIncomingCallsRef.current.push(call);
        }
      });
    };

    const startAsJoiner = () => {
      const peer = new Peer({ debug: 0 });
      peerRef.current = peer;

      peer.on("open", (id) => {
        if (destroyed) {
          peer.destroy();
          return;
        }
        setMyPeerId(id);
        // Open data channel to the anchor.
        const dc = peer.connect(anchorId, { reliable: true });
        anchorConnRef.current = dc;
        attachDataConn(dc);

        dc.on("error", () => {
          // Anchor might have disappeared; try to become anchor ourselves.
          if (!destroyed && !isAnchorRef.current) {
            peer.destroy();
            peerRef.current = null;
            startAsAnchor();
          }
        });
      });

      peer.on("error", (err) => {
        console.warn("[peer joiner] error", err);
      });

      peer.on("connection", (conn) => {
        attachDataConn(conn);
      });
      peer.on("call", (call) => {
        const stream = localStreamRef.current;
        if (stream) {
          call.answer(stream);
          attachMediaConn(call);
        } else {
          // Wait for local stream before answering so the other side gets media.
          pendingIncomingCallsRef.current.push(call);
        }
      });
    };

    startAsAnchor();

    return () => {
      destroyed = true;
      mediaConnsRef.current.forEach((c) => c.close());
      mediaConnsRef.current.clear();
      dataConnsRef.current.forEach((c) => c.close());
      dataConnsRef.current.clear();
      peerRef.current?.destroy();
      peerRef.current = null;
      isAnchorRef.current = false;
      knownPeersRef.current.clear();
      pendingOutgoingCallsRef.current.clear();
      setRemotes({});
      setMyPeerId("");
    };
  }, [meetingId, enabled]);

  // When the local stream becomes available, dial anyone we couldn't dial before
  // and upgrade existing calls (e.g. if we answered without a stream).
  useEffect(() => {
    if (!localStream || !peerRef.current) return;
    // Answer any calls that arrived before the stream was ready.
    pendingIncomingCallsRef.current.forEach((call) => {
      call.answer(localStream);
      mediaConnsRef.current.set(call.peer, call);
      call.on("stream", (remoteStream) => {
        setRemotes((prev) => ({
          ...prev,
          [call.peer]: {
            id: call.peer,
            name: prev[call.peer]?.name ?? call.peer.slice(-6),
            isMuted: prev[call.peer]?.isMuted ?? false,
            isCameraOn: prev[call.peer]?.isCameraOn ?? true,
            stream: remoteStream,
          },
        }));
      });
      call.on("close", () => {
        mediaConnsRef.current.delete(call.peer);
      });
    });
    pendingIncomingCallsRef.current = [];
    // Flush pending outgoing calls
    pendingOutgoingCallsRef.current.forEach((remoteId) => {
      if (!mediaConnsRef.current.has(remoteId)) {
        try {
          const call = peerRef.current!.call(remoteId, localStream);
          mediaConnsRef.current.set(remoteId, call);
          call.on("stream", (remoteStream) => {
            setRemotes((prev) => ({
              ...prev,
              [remoteId]: {
                id: remoteId,
                name: prev[remoteId]?.name ?? remoteId.slice(-6),
                isMuted: prev[remoteId]?.isMuted ?? false,
                isCameraOn: prev[remoteId]?.isCameraOn ?? true,
                stream: remoteStream,
              },
            }));
          });
        } catch {
          /* ignore */
        }
      }
    });
    pendingOutgoingCallsRef.current.clear();

    // Replace video/audio tracks in existing connections so recent stream
    // (e.g. after the user granted permissions later) is transmitted.
    mediaConnsRef.current.forEach((call) => {
      const pc = (call as unknown as { peerConnection?: RTCPeerConnection })
        .peerConnection;
      if (!pc) return;
      const senders = pc.getSenders();
      localStream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) {
          try {
            sender.replaceTrack(track);
          } catch {
            /* ignore */
          }
        }
      });
    });
  }, [localStream]);

  // Broadcast state changes (mute/camera/name) to all connected peers.
  useEffect(() => {
    const payload: PeerMessage = {
      type: "state",
      name: localName,
      isMuted: !isMicOn,
      isCameraOn,
    };
    dataConnsRef.current.forEach((c) => {
      try {
        c.send(payload);
      } catch {
        /* ignore */
      }
    });
  }, [isMicOn, isCameraOn, localName]);

  return {
    remotes: Object.values(remotes),
    myPeerId,
  };
};
