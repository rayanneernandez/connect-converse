import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, MessageSquare, Users } from "lucide-react";
import { toast } from "sonner";
import MeetingControls from "@/components/MeetingControls";
import VideoTile from "@/components/VideoTile";
import CaptionsBar from "@/components/CaptionsBar";
import ChatPanel from "@/components/ChatPanel";
import ParticipantsPanel from "@/components/ParticipantsPanel";
import { Button } from "@/components/ui/button";

type CaptionLang = "PT" | "EN" | "ES" | "Libras";

interface DemoParticipant {
  id: string;
  name: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

const MeetingRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeCaptionLangs, setActiveCaptionLangs] = useState<CaptionLang[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const isCaptionsOn = activeCaptionLangs.length > 0;

  const demoParticipants: DemoParticipant[] = [
    { id: "local", name: "Você", isMuted: !isMicOn, isCameraOn },
    { id: "maria", name: "Maria Silva", isMuted: false, isCameraOn: true },
    { id: "joao", name: "João Santos", isMuted: true, isCameraOn: false },
    { id: "ana", name: "Ana (Libras)", isMuted: false, isCameraOn: true },
  ];

  const allCaptions = [
    { id: "1", speaker: "Maria Silva", text: "Olá, boa tarde a todos!", type: "speech" as const, language: "PT" },
    { id: "2", speaker: "João Santos", text: "Hello everyone → Olá a todos", type: "speech" as const, language: "EN" },
    { id: "3", speaker: "João Santos", text: "Hola a todos → Olá a todos", type: "speech" as const, language: "ES" },
    { id: "4", speaker: "Ana (Libras)", text: "Bom dia, estou acompanhando a reunião", type: "libras" as const, language: "Libras" },
  ];

  const filteredCaptions = allCaptions.filter((c) => {
    if (c.type === "libras") return activeCaptionLangs.includes("Libras");
    return c.language && activeCaptionLangs.includes(c.language as CaptionLang);
  });

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
      } catch {
        console.log("Camera/mic not available");
      }
    };
    getMedia();
    return () => {
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/meeting/${id}`);
    toast.success("Link copiado!");
  };

  const handleLeave = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    screenStream?.getTracks().forEach((t) => t.stop());
    navigate("/");
  };

  const toggleRecording = () => {
    setIsRecording((r) => !r);
    toast(isRecording ? "Gravação parada" : "Gravação iniciada", { icon: isRecording ? "⏹️" : "🔴" });
  };

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

  // Build tiles - pinned goes large
  const allTiles = [
    ...(isScreenSharing ? [{ id: "screen", name: "Tela Compartilhada", isMuted: true, isCameraOn: true }] : []),
    ...demoParticipants,
  ];

  const pinnedTile = pinnedId ? allTiles.find((t) => t.id === pinnedId) : null;
  const unpinnedTiles = allTiles.filter((t) => t.id !== pinnedId);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="h-14 glass flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Reunião: {id}</h2>
          <button onClick={copyLink} className="text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-4 h-4" />
          </button>
          {isRecording && (
            <div className="flex items-center gap-1.5 text-destructive">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
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
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 p-4 flex flex-col gap-3 min-h-0">
          {pinnedTile ? (
            /* Pinned layout: large + sidebar */
            <div className="flex-1 flex gap-3 min-h-0">
              <div className="flex-1 min-h-0">
                <VideoTile
                  name={pinnedTile.name}
                  isMuted={pinnedTile.isMuted}
                  isCameraOn={pinnedTile.isCameraOn}
                  isLocal={pinnedTile.id === "local"}
                  stream={pinnedTile.id === "local" ? localStream : pinnedTile.id === "screen" ? screenStream : null}
                  isPinned
                  onPin={() => togglePin(pinnedTile.id)}
                />
              </div>
              <div className="w-48 flex flex-col gap-2 overflow-y-auto">
                {unpinnedTiles.map((p) => (
                  <div key={p.id} className="h-28 flex-shrink-0">
                    <VideoTile
                      name={p.name}
                      isMuted={p.isMuted}
                      isCameraOn={p.isCameraOn}
                      isLocal={p.id === "local"}
                      stream={p.id === "local" ? localStream : p.id === "screen" ? screenStream : null}
                      onPin={() => togglePin(p.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Grid layout */
            <div className="flex-1 grid grid-cols-2 gap-3 auto-rows-fr min-h-0">
              {allTiles.map((p) => (
                <VideoTile
                  key={p.id}
                  name={p.name}
                  isMuted={p.isMuted}
                  isCameraOn={p.isCameraOn}
                  isLocal={p.id === "local"}
                  stream={p.id === "local" ? localStream : p.id === "screen" ? screenStream : null}
                  onPin={() => togglePin(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Side panels */}
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
              participants={demoParticipants}
            />
          </div>
        )}
      </div>

      {/* Captions - simple text below video */}
      <CaptionsBar captions={filteredCaptions} isVisible={isCaptionsOn} />

      {/* Controls */}
      <div className="flex justify-center pb-4 pt-1 flex-shrink-0">
        <MeetingControls
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          isRecording={isRecording}
          isScreenSharing={isScreenSharing}
          isCaptionsOn={isCaptionsOn}
          activeCaptionLangs={activeCaptionLangs}
          onToggleMic={() => setIsMicOn(!isMicOn)}
          onToggleCamera={() => setIsCameraOn(!isCameraOn)}
          onToggleRecording={toggleRecording}
          onToggleScreenShare={toggleScreenShare}
          onToggleCaptionLang={toggleCaptionLang}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
};

export default MeetingRoom;
