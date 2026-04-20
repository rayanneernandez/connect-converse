import { useState, useEffect, useRef, useCallback } from "react";
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
import {
  BackgroundMode,
  FilterMode,
  useProcessedStream,
} from "@/hooks/useProcessedStream";
import { useMeetingRecorder } from "@/hooks/useMeetingRecorder";

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

  // WebRTC mesh — only connects after the user clicks "Join" in the lobby.
  const { remotes } = useMeetingPeers({
    meetingId: id ?? "",
    localStream,
    localName: displayName || "Convidado",
    isMicOn,
    isCameraOn,
    enabled: hasJoined,
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

  const filteredCaptions: Array<{
    id: string;
    speaker: string;
    text: string;
    type: "speech" | "libras";
    language?: string;
  }> = [];

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

  const doLeave = useCallback(() => {
    try {
      rawLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (recorder.isRecording) recorder.stop();
    } catch {
      /* ignore */
    }
  }, [recorder]);

  // Auto-leave when the user closes the tab / navigates away.
  useEffect(() => {
    const handler = () => doLeave();
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [doLeave]);

  const meetingLink = `${window.location.origin}/meeting/${id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink);
    toast.success("Link copiado!");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(id ?? "");
    toast.success("Código copiado!");
  };

  const handleLeave = () => {
    doLeave();
    navigate("/");
  };

  /* ---------- Recording ---------- */

  const onRecordingButtonClick = () => {
    if (recorder.isRecording) {
      recorder.stop();
      toast.success(
        `Gravação encerrada. Uma cópia será enviada para ${recorder.email}.`
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
    toast(`Gravando reunião. Cópia será enviada para ${email}.`, { icon: "🔴" });
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

      <CaptionsBar captions={filteredCaptions} isVisible={isCaptionsOn} />

      <div className="flex justify-center pb-4 pt-1 flex-shrink-0">
        <MeetingControls
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          isRecording={recorder.isRecording}
          isScreenSharing={isScreenSharing}
          isCaptionsOn={isCaptionsOn}
          activeCaptionLangs={activeCaptionLangs}
          background={background}
          filter={filter}
          onToggleMic={() => setIsMicOn(!isMicOn)}
          onToggleCamera={() => setIsCameraOn(!isCameraOn)}
          onToggleRecording={onRecordingButtonClick}
          onToggleScreenShare={toggleScreenShare}
          onToggleCaptionLang={toggleCaptionLang}
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
