# Libras recognition backend (starter)

Serviço Python que roda reconhecimento de sinais de Libras em tempo real
usando MediaPipe Hands + classificador baseado em regras. O frontend se
conecta via WebSocket, envia frames JPEG e recebe o sinal reconhecido como
legenda.

É um **starter**: reconhece um vocabulário inicial (oi, tchau, sim, não,
obrigado, por favor, bom, ruim). Trocar o classificador por um modelo
treinado depois não muda o resto da arquitetura.

## Como rodar localmente

Pré-requisito: Python 3.10+ instalado.

### Linux / macOS (bash/zsh)

```bash
cd libras-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

### Windows — PowerShell

```powershell
cd libras-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
```

Se o PowerShell bloquear o `Activate.ps1` com erro de política de execução,
rode uma vez na mesma janela:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

### Windows — CMD

```cmd
cd libras-backend
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
python server.py
```

Em qualquer ambiente, quando o venv está ativo o prompt começa com `(.venv)`
e o servidor sobe em `http://localhost:8000`. Em dev, para recarregar
automaticamente ao mudar o código, use `uvicorn server:app --reload --port 8000`
no lugar de `python server.py`.

O servidor expõe:

- `GET /health` — checagem de vida
- `WS  /libras` — WebSocket de reconhecimento

## Como ligar o frontend

No arquivo `.env.local` do projeto Vite (raiz), crie:

```
VITE_LIBRAS_WS_URL=ws://localhost:8000/libras
```

Reinicie o `npm run dev`. Quando você selecionar "Libras" no menu de
legendas, o frontend vai abrir um WebSocket para esse endereço e começar a
enviar frames da câmera a ~3 fps. Sinais reconhecidos viram legendas e são
transmitidos para os outros participantes da chamada.

## Protocolo WebSocket

Cliente → servidor:

- (opcional) texto JSON: `{"type":"hello","fps":3}`
- frames binários JPEG, um por frame de webcam

Servidor → cliente:

- texto JSON:
  ```json
  {"type":"libras","id":"xxxx","text":"oi","confidence":0.88,"final":true}
  ```

## Quando quiser um modelo de verdade

1. Colete alguns segundos de cada sinal que você quer reconhecer com pessoas
   diferentes (MINDS-Libras é um bom ponto de partida).
2. Use `mp_hands.Hands` com `static_image_mode=False` para extrair
   landmarks — são 21 pontos `(x, y, z)` por frame.
3. Agrupe em janelas de 24–30 frames, treine um MLP ou LSTM pequeno em
   cima disso (o vetor de features por frame tem 63 dimensões).
4. Troque a função `classify(frames)` em `classifier.py` por
   `model.predict(features_tensor)`.

## Banco de dados (opcional)

Este starter não grava nada. Quando quiser histórico de sessões:

1. Instale `sqlalchemy[asyncio] asyncpg` (Postgres) ou `aiosqlite` (SQLite).
2. Crie uma tabela `libras_events(meeting_id, user_id, label, confidence, ts)`.
3. Adicione um `async def persist_event(...)` em `server.py` chamado logo
   após `await ws.send_text(...)`.

Sugestão de schema Postgres:

```sql
CREATE TABLE libras_events (
  id BIGSERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence REAL NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX libras_events_meeting_idx ON libras_events(meeting_id, ts);
```

Para identificar o usuário/meeting no backend, passe query params na URL
(`ws://.../libras?meeting=xxx&user=yyy`) — o FastAPI lê via
`ws.query_params`.
