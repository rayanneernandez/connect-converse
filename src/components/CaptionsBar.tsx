import { Globe, Hand } from "lucide-react";

interface Caption {
  id: string;
  speaker: string;
  text: string;
  type: "speech" | "libras";
  language?: string;
}

interface CaptionsBarProps {
  captions: Caption[];
  isVisible: boolean;
}

const CaptionsBar = ({ captions, isVisible }: CaptionsBarProps) => {
  if (!isVisible || captions.length === 0) return null;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4">
      <div className="glass rounded-2xl p-4 space-y-2">
        {captions.slice(-3).map((caption) => (
          <div key={caption.id} className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {caption.type === "libras" ? (
                <Hand className="w-4 h-4 text-accent" />
              ) : (
                <Globe className="w-4 h-4 text-primary" />
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                {caption.speaker}
                {caption.language && ` · ${caption.language}`}
              </span>
              <p className="text-sm font-medium">{caption.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CaptionsBar;
