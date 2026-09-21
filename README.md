# Paglamp Diagram

Mapas mentais e diagramas colaborativos para uso interno da Paglamp — https://diagram.paglamp.com.br

- Regras do projeto e fluxo de trabalho: [CLAUDE.md](CLAUDE.md)
- Histórico de mudanças: [STORY.md](STORY.md)
- Decisões de arquitetura: [docs/adr/](docs/adr/)

## Rodando localmente

Requisitos: Node 22+, pnpm 9, Docker.

```bash
cp .env.example .env
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm dev
```

Web em http://localhost:5173 (a API fica em :3001, acessada pelo proxy do Vite).

## Deploy (VPS com Traefik)

```bash
cp .env.example .env   # preencha a seção "Produção"
docker compose up -d --build
```
