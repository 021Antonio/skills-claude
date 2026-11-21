---
name: "projeto-por-tarefas-autonomas"
description: "Transforma uma ideia ou um projeto existente em spec, tarefas por modelo e tempo, TDD obrigatório e execução orquestrada: a conversa principal planeja, decide e revisa; cada tarefa roda num processo headless do Claude Code com o modelo definido, num worktree próprio. Inclui mapa do código com graphify, skills superpowers, portão de qualidade, modo noturno e fechamento honesto."
---

# projeto-por-tarefas-autonomas

Fluxo completo da ideia (ou de um repositório existente) até um projeto que se constrói tarefa por tarefa, com testes primeiro, o modelo certo em cada tarefa, revisão antes do commit e tags de etapa. Idioma dos arquivos: português do Brasil, sem travessão (use vírgula, ponto ou dois pontos).

## Papéis

- **Orquestrador**: a conversa onde a skill foi chamada. Entrevista, lê o código, escreve spec, tarefas e plano, escolhe o modelo, responde dúvidas, dispara a execução, **revisa** o resultado, roda o portão e faz o commit. Não implementa tarefa de código ele mesmo.
- **Executor**: um processo novo `claude -p` por tarefa, com o `model` do frontmatter, num `git worktree` próprio. Lê só a tarefa e as seções de spec citadas, faz TDD, roda o critério de pronto e para. Não faz commit, não pergunta (decide pela spec e registra em `docs/duvidas.md`).

O orquestrador só executa uma tarefa em linha quando o usuário pede explicitamente, ou quando é mudança só de documentação de poucas linhas. Nesse caso diz isso no resumo e no `docs/PLAN.md` (coluna Modelo real), para o plano não mentir sobre quem fez.

## Princípios (valem em todas as fases)

1. **Spec antes de código.** Nenhuma tarefa nasce sem critério de pronto executável.
2. **TDD em toda mudança de código**, sem exceção para "correção pequena": seguir a skill `superpowers:test-driven-development`. Escrever o teste, **ver falhar pelo motivo certo** (a falha esperada, não erro de compilação de outra coisa), implementar o mínimo, ver passar, refatorar. Quando o vermelho só puder ser de compilação (API nova), declarar isso no resumo. Defeito existente: o teste reproduz o defeito antes da correção.
3. **Uma tarefa por sessão.** Sessão nova, contexto limpo, lê só o arquivo da tarefa e as seções de spec que ela cita (e o grafo, se houver).
4. **O modelo mais barato que dá conta.** Sobe um nível só quando `escalate_if` ocorre, nunca por precaução.
5. **Determinismo.** Sementes explícitas, relógio injetável, nada de aleatório global, dublês de teste num lugar só.
6. **Decisão não especificada vira registro**, não pergunta: vai para `docs/duvidas.md` com o motivo.
7. **Honestidade sobre o que foi verificado.** Só se afirma o que foi executado. O que não foi testado é declarado como tal. O relatório do executor não é prova: o orquestrador roda o portão de novo.
8. **Nunca commitar na `main`.** Um branch por tarefa (`task/NN-nome`) ou por noite (`night/AAAAMMDD`), revisão por PR.
9. **Ambiente isolado e recursos reais protegidos.** Ferramentas dentro do projeto ou em contêiner. Teste local, ponta a ponta e executor **nunca** tocam banco, fila, armazenamento ou provedor real: ver "Segurança de ambiente".

## Skills de apoio

| Momento | Skill |
| --- | --- |
| Ideia nova ou funcionalidade nova, antes da spec | `superpowers:brainstorming` |
| Projeto existente grande, antes do diagnóstico | `graphify` (ver Fase 0.5) |
| Quebrar a spec em tarefas | `superpowers:writing-plans` (formato desta skill prevalece) |
| Toda tarefa de código (orquestrador manda o executor usar) | `superpowers:test-driven-development` |
| Teste falhando sem causa óbvia, bug, comportamento inesperado | `superpowers:systematic-debugging` |
| Executor isolado | `superpowers:using-git-worktrees` (o script de disparo já cria o worktree) |
| Antes de dizer "pronto" ou commitar | `superpowers:verification-before-completion` |
| Fim de marco, antes do PR | `superpowers:requesting-code-review` |
| Fechar branch ou marco | `superpowers:finishing-a-development-branch` |

## Fase 0: entrevista mínima (uma rodada só)

Se o pedido já traz objetivo, escopo e restrições, pule. Senão, use AskUserQuestion com no máximo 4 perguntas, só sobre o que muda a arquitetura:

- objetivo e público (TCC, produto, estudo, cliente);
- o que é **etapa 1** (entregável sem dependências externas) e o que é **etapa 2** (hardware, integração, produção);
- stack e restrições (linguagem, SO, sem hardware, sem rede, orçamento de tokens);
- como será validado (testes, ensaios, clientes de terceiros, banca).

Projeto existente: perguntar também se o ambiente de homologação pode ter dados recriados e qual é a fonte da verdade (código atual ou documentação).

Em modo não assistido, escolha o padrão mais conservador, registre a leitura adotada no topo de `docs/duvidas.md` e siga.

## Fase 0.5: mapa do código (projeto existente)

Projeto **grande** quando há mais de um serviço, ou mais de ~40 arquivos de código, ou mais de ~5 mil linhas. Nesse caso:

1. Rodar a skill `graphify` na raiz (gera `graphify-out/graph.json` e `GRAPH_REPORT.md`). Se já existir, usar `graphify query "<pergunta>"` antes de ler arquivos. Atualizar com `--update` ao fim de cada marco.
2. Diagnóstico em `docs/diagnostico.md`: o que está bom e fica, o que está ruim (com arquivo e linha), o que dá e o que não dá para melhorar, gravidade. Cada defeito vira tarefa ou entra em "fora do escopo" com o motivo.
3. `graphify-out/` no `.gitignore`. As tarefas podem citar perguntas ao grafo ("Contexto: `graphify query \"quem chama X\"`") para o executor não varrer o repositório.

Projeto pequeno: ler direto, sem grafo.

## Fase 1: spec detalhada em `docs/spec/`

Crie `docs/spec.md` (índice curto com a tabela seção, arquivo, conteúdo) e as seções em `docs/spec/NN-nome.md`. Cada tarefa lerá só as seções que cita, então cada arquivo deve ser autocontido e pequeno (até ~250 linhas).

Seções mínimas:

| Arquivo | Conteúdo obrigatório |
| --- | --- |
| `01-visao-requisitos.md` | objetivo; dentro e fora do escopo; premissas; requisitos funcionais `RFnn` e não funcionais `RNFnn`, **cada um com critério de aceitação mensurável** (limite numérico ou teste que passa) |
| `02-arquitetura-stack.md` | diagrama (Mermaid), stack com motivo e alternativa descartada, estrutura de diretórios |
| `03-modulos-interfaces.md` | cada módulo e suas interfaces (assinaturas, contratos, erros). Pontos de troca plugáveis ficam aqui |
| `04-...md` em diante | o domínio: protocolo, formatos, API (rotas, schemas JSON), modelo de dados, simulador/mocks, dialetos externos |
| `NN-testes.md` | pirâmide de testes, ensaios de desempenho, como o valor real é obtido para medir erro, critérios de aceitação do projeto |

Projeto existente em melhoria: as seções descrevem o comportamento **corrigido** e começam por uma tabela de diagnóstico (defeito, efeito, gravidade).

Regras de escrita da spec:

- Números e formatos exatos (bytes, unidades, limites, portas, timeouts). "Rápido" não é requisito.
- Cada RF/RNF aponta o teste ou ensaio que o comprova (tabela de rastreabilidade no fim da seção de testes).
- Seção "Decisões em aberto" com padrão escolhido para cada uma. Decisão tomada vira ~~riscada~~ com o motivo.
- Marque no texto o que veio de conhecimento do protocolo e ainda precisa ser conferido contra um cliente ou implementação real.
- Limites declarados (fora do escopo) são tão importantes quanto o escopo: o fechamento depende deles.

## Fase 2: tarefas em `tasks/NN-nome.md`

Uma tarefa = uma sessão que cabe em ~60% do contexto. Se o escopo exige mais, divida.

Frontmatter obrigatório:

```yaml
---
id: "03"
title: Título curto
model: haiku | sonnet | opus
session: 4
order: 4
depends_on: ["01", "02"]
parallel_with: ["06"]
weight: P | M | G
escalate_if: "condição concreta e mensurável, ex.: testes seguem falhando após 2 iterações"
spec: docs/spec/03-modulos-interfaces.md, docs/spec/04-protocolo.md
budget_usd: 3        # opcional; padrão por modelo no script de disparo (haiku 2, sonnet 8, opus 20)
                     # peso G ou muitas dependências: 12 para sonnet. Com 8, três tarefas G seguidas
                     # pararam no teto na primeira rodada e cada uma gastou uma rodada só para continuar.
---
```

Corpo, nesta ordem:

1. **Escopo**: 2 a 4 frases.
2. **Arquivos**: cada arquivo com seu papel, assinatura ou comportamento.
3. **Testes (escrever primeiro)**: lista de casos, incluindo erro, borda e determinismo. Para defeito existente, o primeiro caso reproduz o defeito.
4. **Critério de pronto**: bloco com os comandos exatos do portão (os mesmos do `CLAUDE.md`) e os RF/RNF cobertos.
5. **Fora desta tarefa**: o que fica para outra.
6. **Prompt de lançamento**: o script de disparo já monta o prompt padrão; só escrever aqui o que for específico da tarefa.

Tarefa 00 sempre: fundação (gerenciador de build, comandos `test`, `cov`, `lint`, `run`, lint e tipos, CI, pasta de dublês, estrutura de diretórios, script de portão e script de disparo). Modelo haiku.

### Escolha do modelo

| Modelo | Use para |
| --- | --- |
| haiku | estrutura, CRUD, scripts, interfaces simples, painéis simples, documentação mecânica, mudança de configuração |
| sonnet | lógica de domínio, concorrência, transações, segurança, parsing, integração entre serviços, UI com estado, texto técnico |
| opus | só revisão de arquitetura, bug que resistiu a 2 tentativas do sonnet, revisão final de coerência, direção de design uma vez |

Em dúvida, o mais barato com `escalate_if` concreto.

### Tempo e peso (estimativas, calibrar com `runs/`)

| Peso | Escopo típico | Tempo de sessão estimado | Observação |
| --- | --- | --- | --- |
| P | 1 a 3 arquivos, sem lógica nova | 10 a 30 min | haiku costuma bastar |
| M | 3 a 8 arquivos, lógica com testes | 30 a 90 min | caso comum |
| G | muitos arquivos ou domínio novo | 1,5 a 3 h | dividir em duas sessões se possível |

Somar por caminho crítico para dar o prazo mínimo e por total para dar o prazo sequencial. Cada retentativa e cada escalada somam uma sessão. Depois das primeiras tarefas, trocar as estimativas pelos tempos e custos reais de `runs/` e dizer isso no plano.

## Fase 3: plano em `docs/PLAN.md`

Leia só o frontmatter e a seção Escopo de cada tarefa. Valide:

1. grafo de dependências sem ciclos (avise se houver);
2. ordem topológica, caminho crítico primeiro, depois as de menor peso;
3. sessões: uma tarefa por sessão, peso G dividido;
4. paralelismo (`parallel_with`) só entre tarefas sem dependência mútua e sem arquivos em comum;
5. todas com `model`, `escalate_if` e `spec`.

Escreva `docs/PLAN.md`: tabela (Ordem, Sessão, Tarefa, Modelo, **Modelo real**, Depende de, Paralelizável com, Peso, Tempo estimado, **Custo real**, Escalar se), caminho crítico, marcos, "Como lançar" (script de disparo) e regras de economia. Termine com relatório de até 10 linhas: nº de sessões, divisão por modelo, tempo total e do caminho crítico, riscos. Achado durante a execução que não cabe na tarefa vira tarefa nova no plano, não correção escondida.

## Fase 4: `CLAUDE.md` enxuto, agentes e scripts

`CLAUDE.md` com: descrição em 2 linhas; regras de trabalho (uma tarefa por sessão, ler só a tarefa e as seções citadas, **TDD com a skill superpowers**, mostrar só falhas, pedir diffs, buscas amplas em subagente ou no grafo); comandos (portão completo, portão por módulo, portão rápido, ponta a ponta); convenções (linguagem, arquitetura, relógio injetável, dublês, PII em log, segredos só em variável de ambiente); regras de Git; como disparar uma tarefa.

Crie também:

- `scripts/gate.*`: o portão (build, lint, testes), com opção por módulo e opção rápida sem integração.
- `scripts/run-task.ps1` e `scripts/run-task.sh`: o disparo do executor (ver Fase 6). Modelo em `references` abaixo.
- `.claude/agents/<modelo>-*.md` (opcional): só para quando o usuário preferir subagente dentro da sessão em vez de processo headless.

## Fase 5: estratégia de testes (criar sempre, antes do código)

Pirâmide (nomes conforme a linguagem do projeto):

- unitários: funções puras e use cases com dublês, com testes de propriedade para ida e volta e limites;
- integração: adaptadores reais (banco, fila, cache em contêiner, Testcontainers ou equivalente), marcados para poderem ser pulados no portão rápido;
- conformidade: contratos dourados em arquivo (formatos de mensagem, vetores de cifra, topologia de filas) lidos por todos os serviços que os usam;
- ponta a ponta: sobe o sistema com mocks dos provedores e confere o fluxo completo;
- ensaios de desempenho com sementes fixas, gravando configuração, máquina e métricas.

Regras:

- cada RF/RNF tem pelo menos um teste ou ensaio, rastreado na spec;
- teste de determinismo: mesma semente, mesmo resultado;
- injeção de falha (atraso, perda, timeout, servidor mudo, queda de conexão) por parâmetro, desligada por padrão;
- concorrência se prova com duas execuções simultâneas reais (duas threads, duas instâncias), não por leitura do código;
- teste de configuração: o que o yaml promete (pool, timeout, limite) é conferido no contexto real; chave que nenhum código lê é defeito;
- validação externa: um cliente ou biblioteca de terceiros que não conhece o projeto;
- cobertura medida; núcleo puro perto de 100%;
- portão em todo commit.

## Fase 6: execução orquestrada (padrão)

Para cada tarefa, na ordem do plano:

1. **Preparar** (orquestrador): conferir dependências `ok`, tarefa autocontida, `escalate_if` concreto. Base do worktree: o branch da tarefa anterior (pilha) ou a `main` atualizada.
2. **Disparar** em segundo plano:
   ```powershell
   ./scripts/run-task.ps1 -Task 17                 # modelo do frontmatter
   ./scripts/run-task.ps1 -Task 17 -Model opus     # escalada
   ./scripts/run-task.ps1 -Task 17 -DryRun         # mostra o comando sem rodar
   ```
   O script: lê o frontmatter; cria `git worktree` em `../<repo>-wt/NN` com o branch `task/NN-nome`; roda `claude -p --model <m> --max-budget-usd <teto> --permission-mode acceptEdits --allowedTools <lista> --output-format json` com o prompt padrão; grava `runs/NN-<data>.json` (resultado, custo, turnos) e imprime o resumo e o `git diff --stat` do worktree.
3. **Prompt padrão do executor** (o script monta): "Você é o executor da tarefa NN. Leia apenas tasks/NN-*.md, as seções de docs/spec citadas e o CLAUDE.md. Use a skill superpowers:test-driven-development: escreva os testes da seção Testes, rode e veja falhar pelo motivo certo, implemente, veja passar. Se graphify-out/graph.json existir, use `graphify query` em vez de varrer o repositório. Não pergunte: decida pela spec e registre em docs/duvidas.md. Não faça commit nem push. Não toque em recursos reais. Rode o critério de pronto. Se `escalate_if` ocorrer, pare e descreva o bloqueio. Termine com: arquivos alterados, testes que falharam antes e passaram depois, o que não foi verificado, em até 10 linhas."
4. **Revisar** (orquestrador), com `superpowers:verification-before-completion`:
   - ler o resumo e o `git diff` do worktree (não o arquivo inteiro);
   - conferir que existem testes novos e que eles cobrem a seção Testes da tarefa;
   - quando der, provar o vermelho: reverter só a correção (`git stash` do código principal) e ver o teste falhar, ou rodar com a configuração antiga;
   - rodar o portão no worktree;
   - procurar escopo vazado (arquivo fora da lista sem motivo), segredo, PII em log, `Thread.sleep` em teste, chave de configuração morta.
   - depois do commit, `git show --name-only`: arquivo necessário ignorado pelo `.gitignore` que ficou de fora (ex.: `gradle-wrapper.jar` com `*.jar` ignorado, que só aparece num clone limpo), e arquivo copiado de outro módulo sem função. Na dúvida, compilar num worktree limpo do branch;
   - em tarefa de documentação: procurar marcador de substituição solto (ex.: `{HB}`), troca mecânica de termo que deixa frase sem sentido, número ou nome afirmado sem conferir no código, e arquivo da lista não tocado. Na primeira prova real o executor declarou "tudo verde" com 6 defeitos assim.
5. **Decidir**: aprovado, então commit curto no imperativo no branch da tarefa e linha do `docs/PLAN.md` com modelo e custo reais. Reprovado, então uma nova rodada do executor no mesmo worktree com a lista numerada do que reprovou (`run-task -Task NN -Feedback '1) ... 2) ...'`, sem aspas duplas; cite arquivo e fato correto em cada item); falhou de novo, **escala o modelo** uma vez (haiku, sonnet, opus); falhou de novo, marca `bloqueada`, registra o motivo e pula só os dependentes.
6. **Paralelo**: tarefas `parallel_with` sem arquivo em comum podem ser disparadas juntas, cada uma no seu worktree. Mescle na ordem do plano.
7. **Limpar**: `git worktree remove` depois do commit; o branch fica.

Escrita de documentação curta, plano e dúvidas ficam com o orquestrador. Ao fim de cada marco: `superpowers:requesting-code-review`, PR, tag pelo usuário, `graphify --update` se houver grafo.

## Fase 7: execução noturna (opcional, sem orquestrador)

Quando o usuário quer rodar tudo sem acompanhar: `scripts/run_night.*` (e contêiner, se pedido) com o mesmo executor da Fase 6, em sequência:

- lê `tasks/*.md`, ordena por `order`, respeita `depends_on`; opções `--only`, `--skip`, `--dry-run` (que nunca grava `ok` no estado);
- cria o branch `night/AAAAMMDD` e **nunca** toca a `main`;
- por tarefa: `run-task` com o modelo do frontmatter, depois o portão; falhou, 1 nova tentativa com o erro; falhou, escala uma vez; falhou, `bloqueada` e pula os dependentes;
- commit por tarefa aprovada no portão; push só se `NIGHT_PUSH=1`;
- limite de cota (rate limit, 429): dorme e testa a cada 15 min, desiste após 48 h;
- estado e logs em `runs/` (`state.json`, um JSON por tarefa).

Na manhã seguinte o orquestrador faz a revisão da Fase 6 passo 4 em cada commit antes do PR.

## Segurança de ambiente

Lição de incidente real: um ponta a ponta subiu o serviço com a `DB_URL` do `.env` da raiz e aplicou migrações no banco de homologação.

- Override de teste fixa explicitamente banco, fila, cache e armazenamento dos contêineres locais; nunca herda do `.env`.
- O script de teste lê a configuração **resolvida** (ex.: `docker compose config`) e recusa subir se qualquer URL de banco não for local, ou se aparecer domínio de provedor real (ex.: `supabase.co`, API de pagamento de produção, WhatsApp real).
- Provedores sempre por mock no teste; chave de API vazia no override.
- Portas próprias no host para o ponta a ponta (a porta padrão costuma estar com outro projeto aberto).
- Antes de rodar algo que escreve, confirmar o alvo. Se algo tocou recurso real: parar, derrubar, levantar o dano só por leitura, corrigir a causa, registrar em `docs/duvidas.md` e avisar o usuário antes de rodar de novo.

## Armadilhas conhecidas (Windows)

- PowerShell 5.1: script com acento precisa de BOM; sem `&&`, `??` e ternário; `$ErrorActionPreference = 'Stop'` quebra com aviso em stderr de programa nativo (use `Continue` e confira `$LASTEXITCODE`); aspas de JSON somem em argumento de programa nativo; **pipe para programa nativo põe BOM** no começo do texto (gravar em arquivo UTF-8 sem BOM e copiar, em vez de pipe).
- Arquivos com CRLF misturado: substituição por regex tolerante a `\r?\n`.
- `python` pode ser o atalho da Microsoft Store: conferir o interpretador real antes de usar em script.

## Fase 8: etapas, evidência e fechamento

- Divida o projeto em **etapa 1** (tudo que roda sem dependência externa) e **etapa 2** (hardware, campo, produção). Ao fim da etapa 1, o usuário marca a tag (`v1.0-nome`) e a etapa 2 começa só depois. Cada marco seguinte recebe sua tag. A tag permite **voltar** à etapa 1 sem perder nada (`git worktree add ../x v1.0-nome`).
- Para o que o usuário não consegue executar (ex.: montar hardware), entregue: manual passo a passo em fases com teste, resultado esperado, critério de aprovado, evidência a guardar e condição de parada; e um documento de **plano B** que explica como seguir só com o software. Gere PDF de cada um se pedido.
- Se faltar uma ponte entre componentes, crie o menor script possível, teste contra o simulador e avise o usuário.
- Ações externas (push, PR, deploy, variáveis em provedor de nuvem) só com ok explícito do usuário, e na ordem que não derruba produção (ex.: variável nova antes do merge quando há auto-deploy).
- Texto acadêmico: termo do método correto (ex.: *software-in-the-loop*), limitações explícitas, números rastreados a arquivos de evidência, nada afirmado sobre o que não foi medido.
- Relato final curto: o que saiu, onde está, o que **não** foi verificado, quanto custou por modelo, um próximo passo real.

## References: `scripts/run-task.ps1` (modelo)

Adapte o portão e a lista de ferramentas ao projeto. Pontos que não podem faltar: worktree por tarefa, modelo do frontmatter com override, teto de custo, `--output-format json` gravado em `runs/`, sem commit pelo executor, `-DryRun`.

```powershell
param([Parameter(Mandatory)][string]$Task, [string]$Model, [double]$BudgetUsd = 0, [string]$Base = 'HEAD', [switch]$DryRun)
$ErrorActionPreference = 'Continue'
$root = (git rev-parse --show-toplevel).Trim()
$file = Get-ChildItem (Join-Path $root 'tasks') -Filter "$Task-*.md" | Select-Object -First 1
if (-not $file) { Write-Host "Tarefa $Task não encontrada"; exit 1 }
$front = ([regex]::Match((Get-Content $file.FullName -Raw), '(?s)^---\r?\n(.*?)\r?\n---')).Groups[1].Value
function Campo($n) { ([regex]::Match($front, "(?m)^$n\s*:\s*`"?([^`"\r\n#]+)")).Groups[1].Value.Trim() }
if (-not $Model) { $Model = Campo 'model' }
if ($BudgetUsd -le 0) { $b = Campo 'budget_usd'; $BudgetUsd = if ($b) { [double]$b } else { @{ haiku = 2; sonnet = 8; opus = 20 }[$Model] } }
$branch = 'task/' + $file.BaseName
$wt = Join-Path (Split-Path $root -Parent) ((Split-Path $root -Leaf) + "-wt\$Task")
# ... git worktree add -b $branch $wt $Base (ou reaproveita), monta o prompt padrão,
# roda claude -p no $wt e grava runs/$Task-<data>.json; imprime custo, turnos e git diff --stat.
```
