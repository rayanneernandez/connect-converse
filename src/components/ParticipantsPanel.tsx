import { X, Mic, MicOff, Video, VideoOff } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

interface ParticipantsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
}

const ParticipantsPanel = ({ isOpen, onClose, participants }: ParticipantsPanelProps) => {
  if (!isOpen) return null;

  return (
    <div className="flex h-full w-full max-w-sm flex-col rounded-2xl glass md:w-80">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold">Participantes ({participants.length})</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium">{p.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {p.isMuted ? (
                <MicOff className="w-4 h-4 text-destructive" />
              ) : (
                <Mic className="w-4 h-4 text-muted-foreground" />
              )}
              {p.isCameraOn ? (
                <Video className="w-4 h-4 text-muted-foreground" />
              ) : (
                <VideoOff className="w-4 h-4 text-destructive" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantsPanel;
