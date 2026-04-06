import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, MessageSquare, Users, Settings } from "lucide-react";
import { toast } from "sonner";
import MeetingControls from "@/components/MeetingControls";
import VideoTile from "@/components/VideoTile";
import CaptionsBar from "@/components/CaptionsBar";
import ChatPanel from "@/components/ChatPanel";
import ParticipantsPanel from "@/components/ParticipantsPanel";
import { Button } from "@/components/ui/button";

const MeetingRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCaptionsOn, setIsCaptionsOn] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const participants = [
    { id: "1", name: "Você", isMuted: !isMicOn, isCameraOn },
    { id: "2", name: "Maria Silva", isMuted: false, isCameraOn: true },
    { id: "3", name: "João Santos", isMuted: true, isCameraOn: false },
  ];

  const demoCaptions = [
    { id: "1", speaker: "Maria Silva", text: "Olá, boa tarde a todos!", type: "speech" as const, language: "PT" },
    { id: "2", speaker: "João Santos", text: "Hello everyone, nice to meet you", type: "speech" as const, language: "EN → PT: Olá a todos, prazer em conhecê-los" },
    { id: "3", speaker: "Ana (Libras)", text: "Bom dia, estou acompanhando a reunião", type: "libras" as const },
  ];

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
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
    navigate("/");
  };

  const toggleRecording = () => {
    setIsRecording((r) => !r);
    toast(isRecording ? "Gravação parada" : "Gravação iniciada", {
      icon: isRecording ? "⏹️" : "🔴",
    });
  };

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setIsChatOpen(!isChatOpen); setIsParticipantsOpen(false); }}
            className={isChatOpen ? "text-primary" : "text-muted-foreground"}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setIsParticipantsOpen(!isParticipantsOpen); setIsChatOpen(false); }}
            className={isParticipantsOpen ? "text-primary" : "text-muted-foreground"}
          >
            <Users className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video grid */}
        <div className="flex-1 p-4 relative">
          <div className="grid grid-cols-2 gap-3 h-full auto-rows-fr">
            <VideoTile
              name="Você"
              isMuted={!isMicOn}
              isCameraOn={isCameraOn}
              isLocal
              stream={localStream}
            />
            <VideoTile name="Maria Silva" isMuted={false} isCameraOn={true} />
            <VideoTile name="João Santos" isMuted={true} isCameraOn={false} />
            <VideoTile name="Ana (Libras)" isMuted={false} isCameraOn={true} />
          </div>

          {/* Captions */}
          <CaptionsBar captions={demoCaptions} isVisible={isCaptionsOn} />
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

      {/* Controls */}
      <div className="flex justify-center pb-4 pt-2 flex-shrink-0">
        <MeetingControls
          isMicOn={isMicOn}
          isCameraOn={isCameraOn}
          isRecording={isRecording}
          isScreenSharing={isScreenSharing}
          isCaptionsOn={isCaptionsOn}
          onToggleMic={() => setIsMicOn(!isMicOn)}
          onToggleCamera={() => setIsCameraOn(!isCameraOn)}
          onToggleRecording={toggleRecording}
          onToggleScreenShare={() => setIsScreenSharing(!isScreenSharing)}
          onToggleCaptions={() => setIsCaptionsOn(!isCaptionsOn)}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
};

export default MeetingRoom;
