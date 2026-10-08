# Plano para Modo Multiplayer - Pirate Battle

Este documento explora as possibilidades para implementar um modo multiplayer no Pirate Battle, analisando as abordagens de design de jogo e as dificuldades técnicas associadas a cada modelo de rede.

## Arquitetura Atual e Facilidades

O jogo possui uma excelente base para multiplayer graças às decisões técnicas já estabelecidas:

- **Simulação Determinística Independente:** O pacote `@pirate/game-core` funciona sem depender de interface (React), renderização (PixiJS) ou do DOM da web, operando num loop de passos fixos (60Hz).
- **Separação de Input:** Os eventos de teclado/toque (`InputState`) são separados da simulação e traduzidos puramente em intenções carimbadas por tempo (`ShipIntents` - acelerar, virar, atirar).
- **Ready for Backend:** Já existe um pacote `apps/server` (Fastify) que atualmente é um esqueleto, mas que facilmente pode carregar e rodar a lógica do `@pirate/game-core`.
- **Contratos Compartilhados:** A estrutura `@pirate/contracts` facilita o compartilhamento de DTOs entre cliente e servidor.

---

## 1. Modos de Jogo Possíveis

### A. Multiplayer Cooperativo (Co-op PvE)

**Conceito:** 2 a 4 jogadores entram numa mesma sessão e unem forças contra ondas ininterruptas e progressivamente mais difíceis de navios da IA (Chasers e Shooters).

- **Vantagens:** O foco continua sendo o combate contra os sistemas de IA que o jogo já possui. Estimula táticas em conjunto e é menos frustrante em casos de pequenos problemas de conexão (lag) comparado a modos competitivos.
- **Complexidade de Design:** Requer ajustar o balanceamento (quantidade de inimigos espawnando simultaneamente de acordo com o número de jogadores ativos).

### B. PvP Arena (Deathmatch / Free-for-all)

**Conceito:** 2 a 8 jogadores são inseridos na arena em combates navais uns contra os outros durante um tempo limite. Cada kill soma pontos, e mortes subtraem ou contam negativamente.

- **Vantagens:** Aproveita todo o potencial do sistema mecânico e de mobilidade. Muito engajador e competitivo.
- **Complexidade de Design:** Requer pontos de respawn justos, HUD para diferenciar inimigos de aliados e um placar online em tempo real.

### C. PvP em Times (Ex: 2v2 ou 3v3)

**Conceito:** Duas frotas lutando entre si. O primeiro time a perder todos os seus navios ou atingir um placar limite perde a partida.

- **Vantagens:** Grande potencial estratégico (ex: jogadores fazendo formação em linha para disparos laterais múltiplos).
- **Complexidade de Design:** Necessita de um sistema de "Fogo Amigo" (habilitado/desabilitado), canais distintos de comunicação e gerenciamento de partys/equipes (matchmaking mais complexo).

### D. Modo Assíncrono (Batalha contra "Fantasmas")

**Conceito:** O jogador joga a partida em seu cliente, mas enfrenta não apenas a IA, mas também navios controlados pelos "fantasmas" (replays) das melhores partidas de outros jogadores do placar de líderes (Leaderboard).

- **Vantagens:** Falso modo multiplayer que não necessita de jogadores estarem online ao mesmo tempo, reduzindo o tempo de espera no lobby para zero.
- **Complexidade de Design:** Interação limitada; o barco fantasma não reagirá ao jogador ativamente, apenas repetirá o que fez no passado, o que pode causar situações estranhas.

---

## 2. Abordagens Técnicas e Nível de Dificuldade

Implementar jogos de tiro com física em tempo real requer a escolha correta do modelo de sincronização de rede.

### Abordagem 1: Multiplayer Assíncrono (Fantasmas)

- **Como Funciona:** No fim de uma partida, o jogo envia os `ShipIntents` sequenciais de todos os ticks e a _seed_ para o servidor REST. Outro jogador puxa esses inputs e roda a simulação no seu cliente.
- **Dificuldade:** **Baixa**.
- **Prós:** Funciona sob a mesma arquitetura HTTP REST do servidor Fastify atual; não precisa de WebSockets. 100% resistente ao lag.
- **Contras:** Não é multiplayer autêntico de tempo real.

### Abordagem 2: Lockstep Determinístico via Servidor Relay

- **Como Funciona:** Cada jogador envia apenas os seus comandos (Inputs) para o servidor, que imediatamente repassa para os outros. A simulação em cada PC não avança o tick até que os comandos daquele instante tenham chegado de todos os jogadores.
- **Dificuldade:** **Média**.
- **Prós:** Aproveita a natureza determinística do `game-core`. Código muito simples, o servidor Fastify usando WebSockets seria apenas um roteador "burro". Uso mínimo de banda de rede.
- **Contras:** O jogo ficará travando e terá latência (input delay) ditado pelo jogador com a pior internet da partida. Não recomendado para jogos frenéticos sobre a internet aberta (ótimo para LAN).

### Abordagem 3: Servidor Autoritário com Interpolação de Estado ("Dumb Clients")

- **Como Funciona:** O jogo acontece dentro do `apps/server` hospedado remotamente. O cliente do navegador não roda a simulação; ele apenas manda cliques de botão/teclado para o servidor. O servidor processa e, cerca de 10 a 20 vezes por segundo, "cospe" um _snapshot_ do mundo (posições de todo mundo, vida, projéteis). O PixiJS faz a animação suave interpolando essas posições.
- **Dificuldade:** **Alta**.
- **Prós:** Consistência perfeita entre todos e fim absoluto para trapaceiros (cheating/hacks é impossível, pois o servidor dita a regra).
- **Contras:** Requer serializar e comprimir bem o estado do mundo na rede, pois pode gastar muita banda. Existe atraso no comando do próprio jogador, que só verá seu navio se mexer ou atirar quando a resposta voltar do servidor.

### Abordagem 4: Servidor Autoritário com Predição Client-Side e Rollback

- **Como Funciona:** É a evolução da Abordagem 3. O servidor ainda é a autoridade, mas o cliente não espera a resposta dele. O navegador do jogador simula localmente e movimenta seu barco no instante do clique ("Predição"). Quando os dados reais vêm do servidor, o cliente checa se diferem; caso positivo, o cliente "rebobina" o jogo invisivelmente e ressimula (Rollback).
- **Dificuldade:** **Muito Alta**.
- **Prós:** O Padrão-Ouro da indústria para jogos competitivos (Rocket League, Overwatch, CS2 usam métodos parecidos). Esconde perfeitamente a latência e traz sensação de jogo em singleplayer (responsivo).
- **Contras:** Exige uma alteração profunda no `@pirate/game-core` para que suporte salvar estados passados instantâneos e capacidade de rodar ticks super rápidos para frente e para trás para corrigir o estado do mundo. Muito difícil de debugar.

---

## 3. Sugestão e Próximos Passos (Plano de Ação)

Para introduzir o multiplayer de maneira pragmática, minimizando os riscos na infraestrutura técnica:

**1. Definir o Modo: Multiplayer Cooperativo (Co-op)**
Focar na experiência PvE colaborativa. Assim, se ocorrerem pequenas discrepâncias de rede entre amigos jogando juntos, não existirá a frustração severa que ocorre em PvP competitivo.

**2. Arquitetura Escolhida: Servidor Autoritário com Interpolação Simples (Abordagem 3)**

- **Por que:** Evita a alta complexidade do Rollback/Predição Client-side (Abordagem 4), e garante estabilidade comparado ao Lockstep (Abordagem 2).
- **O que precisa ser feito:**
  - Instalar suporte a WebSockets (`@fastify/websocket`) em `apps/server`.
  - Criar um gerenciador de sessão que importe o `FixedStepLoop` e `stepWorld` dentro do Node.js.
  - Expandir o pacote `@pirate/contracts` para incluir as definições de mensagens WS (ex: `PlayerInputMessage`, `WorldStateSnapshotMessage`).
  - No `apps/web`, escrever um adaptador no `GameSession.ts` que: se modo for "Rede", desabilita a simulação local completa, e passa a apenas desenhar (no PixiJS) o mundo recebido pelo evento WebSocket.

Este planejamento proporciona um equilíbrio entre a diversão de navegar e atirar em conjunto com amigos e um esforço técnico viável para o estado atual do projeto.
