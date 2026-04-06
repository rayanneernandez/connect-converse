import { Video, Users, Globe, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const HeroSection = () => {
  const [meetingCode, setMeetingCode] = useState("");
  const navigate = useNavigate();

  const createMeeting = () => {
    const id = Math.random().toString(36).substring(2, 10);
    navigate(`/meeting/${id}`);
  };

  const joinMeeting = () => {
    if (meetingCode.trim()) {
      navigate(`/meeting/${meetingCode.trim()}`);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/15 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-muted-foreground">Plataforma de videochamadas com tradução em tempo real</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Conecte-se sem{" "}
          <span className="text-gradient">barreiras</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
          Videochamadas com tradução automática, suporte a Libras e gravação integrada. 
          Comunique-se com qualquer pessoa, em qualquer idioma.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Button
            onClick={createMeeting}
            size="lg"
            className="h-14 px-8 text-base font-semibold rounded-xl glow"
          >
            <Video className="w-5 h-5 mr-2" />
            Nova Reunião
          </Button>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Código da reunião"
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinMeeting()}
              className="h-14 px-5 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 w-64"
            />
            <Button
              onClick={joinMeeting}
              variant="secondary"
              size="lg"
              className="h-14 px-6 rounded-xl"
              disabled={!meetingCode.trim()}
            >
              Entrar
            </Button>
          </div>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { icon: Globe, title: "Tradução ao Vivo", desc: "PT, EN e ES em tempo real" },
            { icon: Users, title: "Suporte a Libras", desc: "Legendas automáticas de Libras" },
            { icon: Shield, title: "Gravação Segura", desc: "Grave e reveja suas reuniões" },
          ].map((f, i) => (
            <div key={i} className="glass rounded-2xl p-6 glass-hover cursor-default">
              <f.icon className="w-8 h-8 text-primary mb-3 mx-auto" />
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
