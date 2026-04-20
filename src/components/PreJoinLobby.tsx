import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BackgroundMode, FilterMode } from "@/hooks/useProcessedStream";

interface PreJoinLobbyProps {
  meetingId: string;
  stream: MediaStream | null;
  name: string;
  onNameChange: (name: string) => void;
  isMicOn: boolean;
  isCameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  background: BackgroundMode;
  filter: FilterMode;
  onChangeBackground: (b: BackgroundMode) => void;
  onChangeFilter: (f: FilterMode) => void;
  onJoin: () => void;
}

const BACKGROUND_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: "none", label: "Sem efeito" },
  { value: "blur", label: "Desfocar fundo" },
  { value: "heavy-blur", label: "Desfocar forte" },
];

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "none", label: "Sem filtro" },
  { value: "warm", label: "Quente" },
  { value: "cool", label: "Frio" },
  { value: "vivid", label: "Vívido" },
  { value: "grayscale", label: "Preto e branco" },
  { value: "sepia", label: "Sépia" },
];

const PreJoinLobby = ({
  meetingId,
  stream,
  name,
  onNameChange,
  isMicOn,
  isCameraOn,
  onToggleMic,
  onToggleCamera,
  background,
  filter,
  onChangeBackground,
  onChangeFilter,
  onJoin,
}: PreJoinLobbyProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showEffects, setShowEffects] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowEffects(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const canJoin = name.trim().length >= 2;
  const effectsActive = background !== "none" || filter !== "none";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl glass rounded-3xl p-6 md:p-10 grid gap-8 md:grid-cols-[1.2fr_1fr]">
        {/* Video preview */}
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
          {isCameraOn && stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: "scaleX(-1)" }}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-3xl font-semibold text-primary">
                  {(name.trim()[0] || "?").toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* Inline toggles */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 glass rounded-full px-3 py-2 flex items-center gap-2">
            <button
              onClick={onToggleMic}
              className={`rounded-full p-2 transition-colors ${
                isMicOn ? "bg-secondary hover:bg-secondary/80" : "bg-destructive text-destructive-foreground"
              }`}
              title={isMicOn ? "Desativar microfone" : "Ativar microfone"}
            >
              {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleCamera}
              className={`rounded-full p-2 transition-colors ${
                isCameraOn ? "bg-secondary hover:bg-secondary/80" : "bg-destructive text-destructive-foreground"
              }`}
              title={isCameraOn ? "Desativar câmera" : "Ativar câmera"}
            >
              {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowEffects((s) => !s)}
                className={`rounded-full p-2 transition-colors ${
                  effectsActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
                title="Efeitos / Fundo"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              {showEffects && (
                <div className="absolute bottom-full mb-2 right-0 w-64 glass rounded-xl p-2 shadow-lg z-10">
                  <p className="text-xs text-muted-foreground px-2 py-1 font-medium">
                    Fundo
                  </p>
                  {BACKGROUND_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      label={opt.label}
                      active={background === opt.value}
                      onClick={() => onChangeBackground(opt.value)}
                    />
                  ))}
                  <div className="h-px bg-border my-1.5" />
                  <p className="text-xs text-muted-foreground px-2 py-1 font-medium">
                    Filtro
                  </p>
                  {FILTER_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      label={opt.label}
                      active={filter === opt.value}
                      onClick={() => onChangeFilter(opt.value)}
                    />
                  ))}
                  <p className="text-[11px] text-muted-foreground px-2 pt-2 pb-1 leading-snug">
                    Você pode combinar um fundo e um filtro.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass mb-4 self-start">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-muted-foreground">
              Reunião: {meetingId}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Pronta para entrar?</h1>
          <p className="text-muted-foreground mb-6">
            Confirme seu nome e ajuste seu áudio e vídeo antes de entrar.
          </p>

          <label className="text-sm font-medium text-muted-foreground mb-1.5">
            Seu nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canJoin) onJoin();
            }}
            placeholder="Como você quer ser chamada?"
            autoFocus
            className="h-12 px-4 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-6"
          />

          <Button
            onClick={onJoin}
            disabled={!canJoin}
            size="lg"
            className="h-12 rounded-xl font-semibold"
          >
            Entrar na reunião
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Ao entrar, você compartilhará sua câmera e microfone com os outros
            participantes.
          </p>
        </div>
      </div>
    </div>
  );
};

const SelectItem = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
      active ? "bg-primary/20 text-primary" : "text-foreground hover:bg-secondary"
    }`}
  >
    {label}
    {active && <div className="w-2 h-2 rounded-full bg-primary" />}
  </button>
);

export default PreJoinLobby;
