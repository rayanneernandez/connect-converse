import { Mic, MicOff, Pin, PinOff } from "lucide-react";
import { useEffect, useRef } from "react";

interface VideoTileProps {
  name: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isLocal?: boolean;
  stream?: MediaStream | null;
  isPinned?: boolean;
  onPin?: () => void;
}

const VideoTile = ({ name, isMuted, isCameraOn, isLocal, stream, isPinned, onPin }: VideoTileProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-secondary border group transition-all duration-200 ${
        isPinned ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      {isCameraOn && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center min-h-[200px]">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-2xl font-semibold text-primary">{initials}</span>
          </div>
        </div>
      )}

      {/* Pin button */}
      {onPin && (
        <button
          onClick={onPin}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity glass rounded-lg p-1.5 hover:bg-secondary"
        >
          {isPinned ? (
            <PinOff className="w-4 h-4 text-primary" />
          ) : (
            <Pin className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Name badge */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <div className="glass rounded-lg px-3 py-1.5 flex items-center gap-2">
          {isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-success" />
          )}
          <span className="text-sm font-medium">
            {name} {isLocal && "(Você)"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VideoTile;
