import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef } from "react";

interface VideoTileProps {
  name: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isLocal?: boolean;
  stream?: MediaStream | null;
  isLarge?: boolean;
}

const VideoTile = ({ name, isMuted, isCameraOn, isLocal, stream, isLarge }: VideoTileProps) => {
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
    <div className={`relative rounded-2xl overflow-hidden bg-secondary border border-border group ${isLarge ? "col-span-2 row-span-2" : ""}`}>
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

      {/* Recording indicator */}
      {isLocal && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="glass rounded-lg px-2 py-1 text-xs text-muted-foreground">
            {isLocal ? "Local" : ""}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoTile;
