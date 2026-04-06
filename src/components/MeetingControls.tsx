import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff,
  MessageSquare, Users, Circle, Subtitles, Hand
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MeetingControlsProps {
  isMicOn: boolean;
  isCameraOn: boolean;
  isRecording: boolean;
  isScreenSharing: boolean;
  isCaptionsOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleRecording: () => void;
  onToggleScreenShare: () => void;
  onToggleCaptions: () => void;
  onLeave: () => void;
}

const MeetingControls = ({
  isMicOn, isCameraOn, isRecording, isScreenSharing, isCaptionsOn,
  onToggleMic, onToggleCamera, onToggleRecording, onToggleScreenShare,
  onToggleCaptions, onLeave,
}: MeetingControlsProps) => {
  const controls = [
    {
      icon: isMicOn ? Mic : MicOff,
      label: isMicOn ? "Silenciar" : "Ativar Mic",
      onClick: onToggleMic,
      className: isMicOn ? "control-btn-active" : "control-btn-inactive",
    },
    {
      icon: isCameraOn ? Video : VideoOff,
      label: isCameraOn ? "Desativar Câmera" : "Ativar Câmera",
      onClick: onToggleCamera,
      className: isCameraOn ? "control-btn-active" : "control-btn-inactive",
    },
    {
      icon: Monitor,
      label: isScreenSharing ? "Parar Compartilhamento" : "Compartilhar Tela",
      onClick: onToggleScreenShare,
      className: isScreenSharing ? "control-btn bg-primary text-primary-foreground" : "control-btn-active",
    },
    {
      icon: Circle,
      label: isRecording ? "Parar Gravação" : "Gravar",
      onClick: onToggleRecording,
      className: isRecording ? "control-btn bg-destructive text-destructive-foreground animate-pulse" : "control-btn-active",
    },
    {
      icon: Subtitles,
      label: isCaptionsOn ? "Desativar Legendas" : "Ativar Legendas",
      onClick: onToggleCaptions,
      className: isCaptionsOn ? "control-btn bg-primary text-primary-foreground" : "control-btn-active",
    },
  ];

  return (
    <div className="glass rounded-2xl px-6 py-3 flex items-center gap-3">
      {controls.map((ctrl, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <button onClick={ctrl.onClick} className={ctrl.className}>
              <ctrl.icon className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{ctrl.label}</p>
          </TooltipContent>
        </Tooltip>
      ))}

      <div className="w-px h-8 bg-border mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onLeave} className="control-btn-danger">
            <PhoneOff className="w-5 h-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Sair da Reunião</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default MeetingControls;
