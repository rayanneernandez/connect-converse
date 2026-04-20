import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff,
  Circle, Subtitles
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useRef, useEffect } from "react";

type CaptionLang = "PT" | "EN" | "ES" | "Libras";

interface MeetingControlsProps {
  isMicOn: boolean;
  isCameraOn: boolean;
  isRecording: boolean;
  isScreenSharing: boolean;
  isCaptionsOn: boolean;
  activeCaptionLangs: CaptionLang[];
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleRecording: () => void;
  onToggleScreenShare: () => void;
  onToggleCaptionLang: (lang: CaptionLang) => void;
  onLeave: () => void;
}

const CAPTION_OPTIONS: { value: CaptionLang; label: string }[] = [
  { value: "PT", label: "Português" },
  { value: "EN", label: "English" },
  { value: "ES", label: "Español" },
  { value: "Libras", label: "Libras" },
];

const MeetingControls = ({
  isMicOn, isCameraOn, isRecording, isScreenSharing, isCaptionsOn, activeCaptionLangs,
  onToggleMic, onToggleCamera, onToggleRecording, onToggleScreenShare,
  onToggleCaptionLang, onLeave,
}: MeetingControlsProps) => {
  const [showCaptionMenu, setShowCaptionMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowCaptionMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
  ];

  return (
    <div className="flex flex-col items-center gap-2">
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

        {/* Caption button with dropdown */}
        <div className="relative" ref={menuRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowCaptionMenu(!showCaptionMenu)}
                className={`control-btn flex items-center gap-0.5 ${
                  isCaptionsOn ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                <Subtitles className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Legendas</p>
            </TooltipContent>
          </Tooltip>

          {showCaptionMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass rounded-xl p-2 min-w-[160px] shadow-lg">
              <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Idiomas das legendas</p>
              {CAPTION_OPTIONS.map((opt) => {
                const isActive = activeCaptionLangs.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => onToggleCaptionLang(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                      isActive ? "bg-primary/20 text-primary" : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    {opt.label}
                    {isActive && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
    </div>
  );
};

export default MeetingControls;
