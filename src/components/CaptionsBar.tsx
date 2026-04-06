interface CaptionsBarProps {
  captions: { id: string; speaker: string; text: string; type: "speech" | "libras"; language?: string }[];
  isVisible: boolean;
}

const CaptionsBar = ({ captions, isVisible }: CaptionsBarProps) => {
  if (!isVisible || captions.length === 0) return null;

  const latest = captions[captions.length - 1];

  return (
    <div className="w-full text-center py-2 px-4 flex-shrink-0">
      <p className="text-sm">
        <span className="text-muted-foreground font-medium">{latest.speaker}: </span>
        <span className="font-medium">{latest.text}</span>
      </p>
    </div>
  );
};

export default CaptionsBar;
