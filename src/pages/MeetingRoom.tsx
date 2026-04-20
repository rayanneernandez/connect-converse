import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, MessageSquare, Users } from "lucide-react";
import { toast } from "sonner";
import MeetingControls from "@/components/MeetingControls";
import VideoTile from "@/components/VideoTile";
import CaptionsBar from "@/components/CaptionsBar";
import ChatPanel from "@/components/ChatPanel";
import ParticipantsPanel from "@/components/ParticipantsPanel";
import PreJoinLobby from "@/components/PreJoinLobby";
import RecordEmailDialog from "@/components/RecordEmailDialog";
import { Button } from "@/components/ui/button";
import { useMeetingPeers } from "@/hooks/useMeetingPeers";
import type { RemoteCaption } from "@/hooks/useMeetingPeers";
import {
  BackgroundMode,
  FilterMode,
  useProcessedStream,
} from "@/hooks/useProcessedStream";
import { useMeetingRecorder } from "@/hooks/useMeetingRecorder";
import {
  useSpeechCaptions,
  type CaptionLangCode,
  type SRStatus,
} from "@/hooks/useSpeechCaptions";
import { useVLibras } from "@/hooks/useVLibras";
import { useLibrasRecognition } from "@/hooks/useLibrasRecognition";
import { translateText, toShortLang } from "@/lib/translate";
import type { CaptionEntry } from "@/components/CaptionsBar";

type CaptionLang = "PT" | "EN" | "ES" | "Libras";

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

const MeetingRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Lobby / joined state
  const [hasJoined, setHasJoined] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeCaptionLangs, setActiveCaptionLangs] = useState<CaptionLang[]>([]);
  // What language the local user actually speaks into the mic. This is what
  // the Web Speech API is configured to recognize. Independent from which
  // caption languages the user wants to see — captions in other languages
  // are produced by translating this one.
  const [myLang, setMyLang] = useState<CaptionLangCode>(() => {
    const nav = typeof navigator !== "undefined" ? navigator.language : "";
    if (nav.toLowerCase().startsWith("en")) return "EN";
    if (nav.toLowerCase().startsWith("es")) return "ES";
    return "PT";
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [rawLocalStream, setRawLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // Effects are split so the user can combine a background with a filter.
  const [background, setBackground] = useState<BackgroundMode>("none");
  const [filter, setFilter] = useState<FilterMode>("none");

  // Recording dialog state
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const recorder = useMeetingRecorder();

  const isCaptionsOn = activeCaptionLangs.length > 0;

  // Apply effects to the outgoing stream so everyone sees the same processed
  // video (and the local user sees their own effects in the preview too).
  const localStream = useProcessedStream(rawLocalStream, background, filter);

  // What actually gets sent to remote peers. While screen-sharing, we swap
  // the video track for the screen-share one so other participants see the
  // shared screen (standard Google Meet behavior). Audio stays the mic.
  const outgoingPeerStream = useMemo<MediaStream | null>(() => {
    if (!screenStream) return localStream;
    const combined = new MediaStream();
    // Screen video replaces camera video.
    screenStream.getVideoTracks().forEach((t) => combined.addTrack(t));
    // Prefer mic audio (so peers still hear the speaker) but mix in screen
    // audio too if the user chose "share system audio" in the picker.
    const micAudio = localStream?.getAudioTracks() ?? [];
    micAudio.forEach((t) => combined.addTrack(t));
    screenStream.getAudioTracks().forEach((t) => {
      // Avoid adding the same track twice (shouldn't happen, but safe).
      if (!combined.getAudioTracks().some((a) => a.id === t.id)) {
        combined.addTrack(t);
      }
    });
    return combined;
  }, [localStream, screenStream]);

  /* ---------- Captions / Libras ---------- */
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  // Keep a ref so we can append captions from a callback without stale state.
  const captionsRef = useRef<CaptionEntry[]>([]);
  captionsRef.current = captions;

  const pushCaption = useCallback((c: CaptionEntry) => {
    setCaptions((prev) => {
      // Replace in-flight interim for the same utterance id + lang.
      const existingIdx = prev.findIndex(
        (e) => e.id === c.id && e.lang === c.lang
      );
      let next: CaptionEntry[];
      if (existingIdx >= 0) {
        next = [...prev];
        // Drop the previous interim if the new one is final.
        next.splice(existingIdx, 1);
      } else {
        next = prev;
      }
      next = [...next, c];
      // Keep a rolling window — captions are ephemeral UI.
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  }, []);

  // Keep a ref for the active caption languages so the translation helper
  // always sees the latest selection without re-creating the callback.
  const activeCaptionLangsRef = useRef<CaptionLang[]>(activeCaptionLangs);
  useEffect(() => {
    activeCaptionLangsRef.current = activeCaptionLangs;
  }, [activeCaptionLangs]);

  // Ingest a caption (local or remote) and, for every currently-enabled
  // caption language that differs from the source, also push a translated
  // version so the user can read what was said in their preferred language.
  const ingestCaption = useCallback(
    (entry: CaptionEntry) => {
      // Always push the original — the user may have the source language
      // enabled, or may later enable it.
      pushCaption(entry);

      // Only translate final utterances; interim captions thrash the API.
      if (!entry.final) return;

      const active = activeCaptionLangsRef.current;
      const src = toShortLang(entry.lang);
      if (!src) return;

      // Collect translation targets: every enabled text caption language,
      // plus PT if Libras is enabled (VLibras needs Portuguese text to
      // animate the avatar).
      const targets = new Set<CaptionLangCode>();
      active.forEach((l) => {
        if (l !== "Libras") targets.add(l);
      });
      if (active.includes("Libras")) targets.add("PT");
      // No need to translate into the source language.
      targets.delete(entry.lang as CaptionLangCode);

      targets.forEach((target) => {
        const tgt = toShortLang(target);
        if (!tgt) return;
        translateText(entry.text, src, tgt).then((translated) => {
          if (!translated || translated === entry.text) return;
          pushCaption({
            id: `${entry.id}:trans:${target}`,
            speaker: entry.speaker,
            lang: target,
            text: translated,
            final: true,
            type: entry.type,
            sourceLang: entry.lang,
          });
        });
      });
    },
    [pushCaption]
  );

  const handleRemoteCaption = useCallback(
    (rc: RemoteCaption) => {
      ingestCaption({
        id: `${rc.peerId}:${rc.id}`,
        speaker: rc.speaker,
        lang: rc.lang,
        text: rc.text,
        final: rc.final,
        type: "speech",
      });
    },
    [ingestCaption]
  );

  // WebRTC mesh — only connects after the user clicks "Join" in the lobby.
  // We hand it `outgoingPeerStream` (camera + mic OR screen + mic) so remote
  // participants see whatever the user is currently sharing.
  const { remotes, sendCaption } = useMeetingPeers({
    meetingId: id ?? "",
    localStream: outgoingPeerStream,
    localName: displayName || "Convidado",
    isMicOn,
    isCameraOn,
    enabled: hasJoined,
    onRemoteCaption: handleRemoteCaption,
  });

  const localParticipant: Participant = {
    id: "local",
    name: displayName || "Você",
    isMuted: !isMicOn,
    isCameraOn,
  };

  const remoteParticipants: Participant[] = remotes.map((r) => ({
    id: r.id,
    name: r.name,
    isMuted: r.isMuted,
    isCameraOn: r.isCameraOn,
  }));

  const participants: Participant[] = [localParticipant, ...remoteParticipants];

  // The STT always runs in the user's declared speaking language. Captions in
  // other enabled languages are produced via translation (see ingestCaption).
  const spokenLang: CaptionLangCode = myLang;

  const librasEnabled = activeCaptionLangs.includes("Libras");

  const [srStatus, setSrStatus] = useState<SRStatus>({ kind: "idle" });

  // Run the Web Speech API on the local mic when captions are on.
  useSpeechCaptions({
    enabled: hasJoined && isCaptionsOn && !!spokenLang,
    lang: spokenLang,
    isMicOn,
    onCaption: (c) => {
      // Show locally immediately — ingestCaption also fans out translations
      // into any other enabled caption languages.
      ingestCaption({
        id: `local:${c.id}`,
        speaker: displayName || "Você",
        lang: c.lang,
        text: c.text,
        final: c.final,
        type: "speech",
      });
      // Broadcast the original to peers; each peer translates on their side
      // based on their own selected caption languages.
      sendCaption({
        id: c.id,
        lang: c.lang,
        text: c.text,
        final: c.final,
      });
    },
    onStatus: (s) => {
      setSrStatus(s);
      if (s.kind === "unsupported") {
        toast(
          "Legendas por voz exigem Chrome ou Edge. Seu navegador não suporta a Web Speech API.",
          { icon: "⚠️" }
        );
      } else if (s.kind === "error" && s.error === "not-allowed") {
        toast.error(
          "Permita o acesso ao microfone para que as legendas sejam geradas."
        );
      }
    },
  });

  // Load the VLibras avatar widget when Libras is selected.
  const { ready: librasReady } = useVLibras(librasEnabled);

  // Optional backend-powered Libras → text recognition. Reads from
  // VITE_LIBRAS_WS_URL at build time (e.g. "ws://localhost:8000/libras").
  const librasWsUrl = import.meta.env.VITE_LIBRAS_WS_URL as string | undefined;
  useLibrasRecognition({
    enabled: hasJoined && librasEnabled && !!librasWsUrl,
    localStream: rawLocalStream,
    serverUrl: librasWsUrl ?? "",
    fps: 3,
    onRecognized: (e) => {
      const entry: CaptionEntry = {
        id: `local-libras:${e.id}`,
        speaker: displayName || "Você",
        lang: "PT",
        text: e.text,
        final: e.final,
        type: "libras",
      };
      // ingestCaption pushes the PT version plus any translations needed for
      // the user's other enabled caption languages (EN / ES).
      ingestCaption(entry);
      // Broadcast as a PT caption so other peers see it too.
      sendCaption({
        id: `libras:${e.id}`,
        lang: "PT",
        text: e.text,
        final: e.final,
      });
    },
  });

  // Filter captions for display based on which languages the user enabled.
  const filteredCaptions: CaptionEntry[] = captions.filter((c) =>
    activeCaptionLangs.includes(c.lang as CaptionLang)
  );

  // VLibras renders Portuguese; always hand it the most recent PT caption
  // (which may be a translation of a non-PT utterance produced by ingestCaption).
  const latestCaptionText = (() => {
    for (let i = captions.length - 1; i >= 0; i--) {
      if (captions[i].lang === "PT") return captions[i].text;
    }
    return null;
  })();

  // Acquire camera/mic on mount so the lobby can show the preview.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const getMedia = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setRawLocalStream(stream);
      } catch {
        console.log("Camera/mic not available");
      }
    };
    getMedia();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Enable/disable the real tracks so remote peers react to mute/camera toggles.
  useEffect(() => {
    if (!rawLocalStream) return;
    rawLocalStream.getAudioTracks().forEach((t) => (t.enabled = isMicOn));
  }, [isMicOn, rawLocalStream]);

  useEffect(() => {
    if (!rawLocalStream) return;
    rawLocalStream.getVideoTracks().forEach((t) => (t.enabled = isCameraOn));
  }, [isCameraOn, rawLocalStream]);

  // Keep the recorder up-to-date with which streams should be captured.
  useEffect(() => {
    recorder.syncStreams({
      localStream,
      remotes,
      screenStream,
      localName: displayName || "Você",
    });
  }, [recorder, localStream, remotes, screenStream, displayName]);

  // Leave cleanup: stop tracks and nav away.
  const rawLocalStreamRef = useRef(rawLocalStream);
  const screenStreamRef = useRef(screenStream);
  useEffect(() => {
    rawLocalStreamRef.current = rawLocalStream;
  }, [rawLocalStream]);
  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  const doLeave = useCallback(async (): Promise<void> => {
    try {
      // Make sure the recording is finalized (download triggered) before the
      // page / component tears down.
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      /* ignore */
    }
    try {
      rawLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }, [recorder]);

  // Auto-leave when the user closes the tab / navigates away. We do a best
  // effort to flush the recording; browsers don't guarantee we'll have time
  // to finish the blob on unload, but the recorder also fires onstop from a
  // normal Leave click (which is the reliable path).
  useEffect(() => {
    const handler = () => {
      try {
        if (recorder.isRecording) recorder.stop();
        rawLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [recorder]);

  const meetingLink = `${window.location.origin}/meeting/${id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink);
    toast.success("Link copiado!");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(id ?? "");
    toast.success("Código copiado!");
  };

  const handleLeave = async () => {
    const wasRecording = recorder.isRecording;
    const recordingEmail = recorder.email;
    if (wasRecording) {
      toast(`Finalizando gravação e enviando para ${recordingEmail}…`, {
        icon: "📨",
      });
    }
    await doLeave();
    if (wasRecording) {
      toast.success(
        `Gravação enviada para ${recordingEmail} e baixada no seu computador.`
      );
    }
    navigate("/");
  };

  /* ---------- Recording ---------- */

  const onRecordingButtonClick = async () => {
    if (recorder.isRecording) {
      const to = recorder.email;
      toast(`Finalizando gravação e enviando para ${to}…`, { icon: "📨" });
      await recorder.stop();
      toast.success(
        `Gravação enviada para ${to} e baixada no seu computador.`
      );
    } else {
      setRecordDialogOpen(true);
    }
  };

  const handleStartRecording = (email: string) => {
    setRecordDialogOpen(false);
    recorder.start({
      email,
      localStream,
      remotes,
      screenStream,
      localName: displayName || "Você",
      meetingId: id ?? "reuniao",
    });
    toast(
      `Gravando reunião (você + participantes). Cópia será enviada para ${email}.`,
      { icon: "🔴" }
    );
  };

  /* ---------- Screen share / captions / pin ---------- */

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStream?.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
      if (pinnedId === "screen") setPinnedId(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setIsScreenSharing(true);
        setPinnedId("screen");
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
          setIsScreenSharing(false);
          if (pinnedId === "screen") setPinnedId(null);
        };
      } catch {
        console.log("Screen share cancelled");
      }
    }
  };

  const toggleCaptionLang = (lang: CaptionLang) => {
    setActiveCaptionLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const togglePin = (participantId: string) => {
    setPinnedId((prev) => (prev === participantId ? null : participantId));
  };

  const streamFor = (tileId: string): MediaStream | null => {
    if (tileId === "local") return localStream;
    if (tileId === "screen") return screenStream;
    const remote = remotes.find((r) => r.id === tileId);
    return remote?.stream ?? null;
  };

  const allTiles = [
    ...(isScreenSharing ? [{ id: "screen", name: "Tela Compartilhada", isMuted: true, isCameraOn: true }] : []),
    ...participants,
  ];

  const pinnedTile = pinnedId ? allTiles.find((t) => t.id === pinnedId) : null;
  const unpinnedTiles = allTiles.filter((t) => t.id !== pinnedId);

  const gridColumnsClass =
    allTiles.length <= 1
      ? "grid-cols-1"
      : allTiles.length === 2
      ? "grid-cols-1 md:grid-cols-2"
      : allTiles.length <= 4
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-2 md:grid-cols-3";

  /* ---------- Render lobby ---------- */

  if (!hasJoined) {
    return (
      <PreJoinLobby
        meetingId={id ?? ""}
        stream={localStream}
        name={displayName}
        onNameChange={setDisplayName}
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        onToggleMic={() => setIsMicOn((v) => !v)}
        onToggleCamera={() => setIsCameraOn((v) => !v)}
        background={background}
        filter={filter}
        onChangeBackground={setBackground}
        onChangeFilter={setFilter}
        onJoin={() => {
          if (displayName.trim().length >= 2) setHasJoined(true);
        }}
      />
    );
  }

  /* ---------- Render meeting ---------- */

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="h-14 glass flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <h2 className="text-sm font-semibold">Reunião: {id}</h2>
            <button
              onClick={copyCode}
              title="Copiar código"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 min-w-0 glass rounded-lg px-2.5 py-1">
            <span className="text-xs text-muted-foreground truncate max-w-[280px] md:max-w-[380px]">
              {meetingLink}
            </span>
            <button
              onClick={copyLink}
              title="Copiar link de convite"
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={copyLink}
            title="Copiar link de convite"
            className="sm:hidden text-xs text-primary hover:underline flex-shrink-0"
          >
            Copiar link
          </button>
          {recorder.isRecording && (
            <div className="flex items-center gap-1.5 text-destructive flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <span className="text-xs font-medium">REC</span>
            </div>
          )}
          {isCaptionsOn && srStatus.kind === "listening" && (
            <div
              className="flex items-center gap-1.5 text-primary flex-shrink-0"
              title={`Microfone transcrito em ${myLang} → legenda traduzida para os idiomas selecionados`}
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium">
                Ouvindo {myLang}
              </span>
            </div>
          )}
          {isCaptionsOn && srStatus.kind === "error" && (
            <div
              className="flex items-center gap-1.5 text-destructive flex-shrink-0"
              title={`Erro nas legendas: ${srStatus.error}`}
            >
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <span className="text-xs font-medium">Legenda com erro</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm"
            onClick={() => { setIsChatOpen(!isChatOpen); setIsParticipantsOpen(false); }}
            className={isChatOpen ? "text-primary" : "text-muted-foreground"}>
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm"
            onClick={() => { setIsParticipantsOpen(!isParticipantsOpen); setIsChatOpen(false); }}
            className={isParticipantsOpen ? "text-primary" : "text-muted-foreground"}>
            <Users className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          {pinnedTile ? (
            <div className="flex flex-1 min-h-0 flex-col gap-3 xl:flex-row">
              <div className="flex-1 min-h-0">
                <VideoTile
                  name={pinnedTile.name}
                  isMuted={pinnedTile.isMuted}
                  isCameraOn={pinnedTile.isCameraOn}
                  isLocal={pinnedTile.id === "local"}
                  stream={streamFor(pinnedTile.id)}
                  isPinned
                  onPin={() => togglePin(pinnedTile.id)}
                />
              </div>
              {unpinnedTiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2 overflow-y-auto xl:flex xl:w-56 xl:flex-col">
                  {unpinnedTiles.map((p) => (
                    <div key={p.id} className="h-28 flex-shrink-0">
                      <VideoTile
                        name={p.name}
                        isMuted={p.isMuted}
                        isCameraOn={p.isCameraOn}
                        isLocal={p.id === "local"}
                        stream={streamFor(p.id)}
                        onPin={() => togglePin(p.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`grid flex-1 min-h-0 auto-rows-fr gap-3 ${gridColumnsClass}`}>
              {allTiles.map((p) => (
                <VideoTile
                  key={p.id}
                  name={p.name}
                  isMuted={p.isMuted}
                  isCameraOn={p.isCameraOn}
                  isLocal={p.id === "local"}
                  stream={streamFor(p.id)}
                  onPin={() => togglePin(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {isChatOpen && (
          <div className="p-2 pl-0">
            <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          </div>
        )}
        {isParticipantsOpen && (
          <div className="p-2 pl-0">
            <ParticipantsPanel
              isOpen={isParticipantsOpen}
              onClose={() => setIsParticipantsOpen(false)}
              participants={participants}
            />
          </div>
        )}
      </div>

      <CaptionsBar
        captions={filteredCaptions}
        isVisible={isCaptionsOn}
        librasEnabled={librasEnabled}
        librasSourceText={librasEnabled ? latestCaptionText : null}
        librasSignAvailable={librasReady}
      />

      <div className="flex justify-center pb-4 pt-1 flex-shrink-0">
        <MeetingControls
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          isRecording={recorder.isRecording}
          isScreenSharing={isScreenSharing}
          isCaptionsOn={isCaptionsOn}
          activeCaptionLangs={activeCaptionLangs}
          myLang={myLang}
          background={background}
          filter={filter}
          onToggleMic={() => setIsMicOn(!isMicOn)}
          onToggleCamera={() => setIsCameraOn(!isCameraOn)}
          onToggleRecording={onRecordingButtonClick}
          onToggleScreenShare={toggleScreenShare}
          onToggleCaptionLang={toggleCaptionLang}
          onChangeMyLang={setMyLang}
          onChangeBackground={setBackground}
          onChangeFilter={setFilter}
          onLeave={handleLeave}
        />
      </div>

      <RecordEmailDialog
        open={recordDialogOpen}
        defaultEmail={recorder.email}
        onCancel={() => setRecordDialogOpen(false)}
        onConfirm={handleStartRecording}
      />
    </div>
  );
};

export default MeetingRoom;
