# ADR-003 — Autenticação

| Campo | Valor |
|---|---|
| Status | Aceito (revisado em 2026-09-21) |
| Data | 2026-09-21 |

## Contexto
Só colaboradores da empresa podem acessar. Não há cadastro público. A empresa **não** usa Google Workspace nem Microsoft 365, e os colaboradores não necessariamente têm e-mail `@paglamp.com.br`. Também não há servidor de e-mail (SMTP) configurado para mandar convites.

## Decisão
- **Login com e-mail + senha**, sem SSO.
- **Acessos criados manualmente por um ADMIN** (nome + e-mail + papel). O sistema gera uma **senha provisória**, mostrada **uma única vez** ao admin, que a repassa ao colaborador. No primeiro login o colaborador é obrigado a trocá-la.
- O **primeiro admin** é criado automaticamente no boot a partir das variáveis `SEED_ADMIN_*`, se ainda não existir nenhum admin.
- O e-mail é só o identificador de login; **não há restrição de domínio** (`ALLOWED_EMAIL_DOMAINS` vira opcional — vazio = qualquer e-mail).
- Senha com **argon2id** (`@node-rs/argon2`, binário pré-compilado, sem toolchain no Docker).
- **Sessão opaca** no banco (tabela `Session`; token aleatório de 32 bytes, só o hash SHA-256 é armazenado), enviada em cookie `httpOnly; Secure; SameSite=Lax`. Preferida a JWT porque permite revogar na hora (logout, desativação, troca de senha) e porque o WebSocket reaproveita o mesmo cookie.

## Alternativas consideradas
| Opção | Prós | Contras |
|---|---|---|
| JWT access + refresh (como no Lumen) | Time conhece | Revogação imediata difícil; mais complexidade no WebSocket |
| Convite por e-mail com link | Admin não vê senha | Exige SMTP, que a empresa não tem |
| SSO Google/Microsoft | Sem senha para gerenciar | A empresa não usa nenhum dos dois |

## Consequências
- Desativar um usuário ou redefinir sua senha apaga suas sessões e derruba conexões em tempo real.
- O admin conhece a senha provisória por alguns minutos; mitigado pela troca obrigatória no primeiro login.
- Se um dia houver SMTP ou SSO, entra num novo ADR sem mudar o modelo de sessão.
