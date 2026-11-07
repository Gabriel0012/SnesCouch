# Decisões

## Save na nuvem está desligado

O save fica só neste navegador. Não ligar o save na nuvem de novo, não criar o bucket R2 `snes-couch-saves` e não recolocar o binding `SAVES` nos `wrangler.jsonc`.

A decisão é por custo. O arquivo do estado (e o print da tela) iria para o R2, e esse produto ficou de fora. A conta, a sessão e os amigos continuam no D1 `snes-couch`. A ROM não sai do navegador.

O código do envio permanece em `apps/signal/src/saves.ts` e no cliente, atrás de `cloudSaves` em `apps/web/src/account.ts`. Com o binding ausente, `/api/saves` responde que a nuvem está desligada.
