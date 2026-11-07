# SNES Couch

Dois jogadores, cada um em casa, em jogos de Super Nintendo que já eram de dois controles. Os navegadores rodam o mesmo núcleo, com a mesma ROM, e trocam só os botões.

A ROM não sai do navegador. O servidor só cria a sala. Este repositório não inclui ROM e não diz onde baixar uma.

## Rodar

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:5173 nos dois navegadores. Cada um solta a própria ROM USA. Um cria a sala e passa o código.

Se a página avisar que não está isolada, o servidor de desenvolvimento não aplicou os cabeçalhos `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy`. Sem eles o navegador não libera a memória compartilhada do núcleo.

## Rede

A ligação do jogo é WebRTC. O Worker só encaminha o sinal. Em casa, atrás de CGNAT, a ligação direta falha: preencha `apps/signal/.dev.vars` com um TURN (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`), a partir de `.dev.vars.example`.

## Núcleo

O emulador é o Snes9x, compilado para WebAssembly. A licença dele permite uso pessoal e não comercial, e o binário inclui o filtro `snes_ntsc` (LGPL). Para gerar de novo: `npm run build:core`, com o Emscripten e o código em `core/third_party/snes9x`.

## Testes

```bash
npm test
```

O teste de determinismo usa uma ROM escrita aqui, não um jogo da Nintendo. Cada jogo do catálogo passa pelo mesmo teste se você colocar a sua ROM em `local-roms/` ou apontar `SNES_ROM_DIR`. O arquivo não entra no git.
