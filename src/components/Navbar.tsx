import { Video } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Video className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">MeetFlow</span>
        </Link>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Recursos
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Preços
          </Button>
          <Button size="sm" className="rounded-lg">
            Começar Grátis
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
