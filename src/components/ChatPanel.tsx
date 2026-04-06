import { X, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  sender: string;
  text: string;
  time: string;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatPanel = ({ isOpen, onClose }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", sender: "Sistema", text: "Bem-vindo à reunião!", time: "Agora" },
  ]);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: "Você", text: input, time: "Agora" },
    ]);
    setInput("");
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 glass rounded-2xl flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold">Chat</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-primary">{msg.sender}</span>
              <span className="text-xs text-muted-foreground">{msg.time}</span>
            </div>
            <p className="text-sm text-foreground/90">{msg.text}</p>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Digite uma mensagem..."
            className="flex-1 h-10 px-3 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button size="sm" onClick={sendMessage} className="h-10 w-10 p-0 rounded-lg">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
