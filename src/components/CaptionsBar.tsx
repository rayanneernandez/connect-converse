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
    <div className="w-full max-w-2xl px-4 ml-4 mb-1">
      <div className="glass rounded-xl p-3 space-y-1.5">
        {captions.slice(-3).map((caption) => (
          <div key={caption.id} className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              {caption.type === "libras" ? (
                <Hand className="w-3.5 h-3.5 text-accent" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-primary" />
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
