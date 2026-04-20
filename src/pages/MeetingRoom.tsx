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

interface Participant {
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

  const participants: Participant[] = [
    { id: "local", name: "Você", isMuted: !isMicOn, isCameraOn },
  ];

  const filteredCaptions: Array<{
    id: string;
    speaker: string;
    text: string;
    type: "speech" | "libras";
    language?: string;
  }> = [];

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
    ...participants,
  ];

  const pinnedTile = pinnedId ? allTiles.find((t) => t.id === pinnedId) : null;
  const unpinnedTiles = allTiles.filter((t) => t.id !== pinnedId);

  return (
    <div className="flex min-h-screen flex-col bg-background">
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
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          {pinnedTile ? (
            /* Pinned layout: large + sidebar */
            <div className="flex flex-1 min-h-0 flex-col gap-3 xl:flex-row">
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
              <div className="grid grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:flex xl:w-56 xl:flex-col">
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
            <div className="grid flex-1 min-h-0 auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
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
              participants={participants}
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
