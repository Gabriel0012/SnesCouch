# Decisões

## Save na nuvem está desligado

O save fica só neste navegador. Não ligar o save na nuvem de novo, não criar o bucket R2 `snes-couch-saves` e não recolocar o binding `SAVES` nos `wrangler.jsonc`.

A decisão é por custo. O arquivo do estado (e o print da tela) iria para o R2, e esse produto ficou de fora. A conta, a sessão e os amigos continuam no D1 `snes-couch`. A ROM não sai do navegador.

O código do envio permanece em `apps/signal/src/saves.ts` e no cliente, atrás de `cloudSaves` em `apps/web/src/account.ts`. Com o binding ausente, `/api/saves` responde que a nuvem está desligada.

## Barra de ações e modal de configurações

O que é do jogo aberto fica na barra de ações embaixo da tela: Saves, Manual, Reiniciar, Fechar jogo, volume, Filtro CRT e tela cheia. O que é do emulador fica na modal de configurações (botão da engrenagem, `#settings`): zoom, Fit/Fill, FPS, ping e Esquecer ROM.

Opção nova segue essa divisão. Se mexe só na partida atual, vai para a barra. Se é preferência do emulador, vai para a modal. A barra não ganha botão de configuração solto. No celular em tela cheia, o menu de três pontos espelha a barra e abre a mesma modal.

## Testes E2E

Funcionalidade nova ou mudança de fluxo vem com cenário em `e2e/` (Playwright, só Chromium). Rodar `npm run e2e` antes de subir. O GitHub Actions roda `npm test` e `npm run e2e` em cada push e PR na `main`.

Os testes usam só a ROM caseira de `core/fixtures/test-rom.mjs`, nunca ROM comercial. Ela entra no catálogo como `test-rom` só quando `VITE_E2E=1` (web) e `E2E=1` (servidor), pelo `packages/catalog/test-game.json`. Se a ROM de teste mudar, rodar `npm run e2e:catalog`. Com `VITE_E2E=1`, `window.__snesTest.probe()` devolve o hash do estado por frame, para comparar jogadores e espectadores.

Cada pessoa do teste é um contexto próprio (`person()` em `e2e/helpers.ts`), com `cid` e `localStorage` separados. O E2E sobe o Vite na porta 5174 e o wrangler na 8788, para não brigar com o `npm run dev`.
