import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecordEmailDialogProps {
  open: boolean;
  defaultEmail?: string;
  onCancel: () => void;
  onConfirm: (email: string) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RecordEmailDialog = ({
  open,
  defaultEmail = "",
  onCancel,
  onConfirm,
}: RecordEmailDialogProps) => {
  const [email, setEmail] = useState(defaultEmail);
  const [touched, setTouched] = useState(false);
  const isValid = EMAIL_REGEX.test(email.trim());

  const handleConfirm = () => {
    setTouched(true);
    if (isValid) onConfirm(email.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar gravação</DialogTitle>
          <DialogDescription>
            Informe o e-mail para receber uma cópia da gravação quando a reunião
            terminar. Você precisa permitir a captura da tela/aba para gravar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="recording-email">E-mail para envio</Label>
          <Input
            id="recording-email"
            type="email"
            value={email}
            placeholder="voce@exemplo.com"
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            autoFocus
          />
          {touched && !isValid && (
            <p className="text-xs text-destructive">
              Digite um e-mail válido para continuar.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Iniciar gravação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecordEmailDialog;
