// Testes da derivação do estado do painel da obra a partir do repositório.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lerFrontmatter, lerRodada, derivarEstado } = require("../estado.js");

const agora = new Date("2026-10-27T01:00:00-03:00");

test("lê o frontmatter da tarefa", () => {
  const t = lerFrontmatter(`---\nid: "27"\ntitle: Assumir a conversa\nmodel: sonnet\nweight: G\ndepends_on: ["25", "22"]\n---\n\n## Escopo`);
  assert.deepEqual(t, { id: "27", titulo: "Assumir a conversa", modelo: "sonnet", peso: "G", dependeDe: ["25", "22"] });
});

test("rodada sem JSON completo é rodando, com o início tirado do nome do arquivo", () => {
  const r = lerRodada("23-20261027-002039-sonnet.json", "", new Date("2026-10-27T00:20:40-03:00"), null, agora);
  assert.equal(r.tarefa, "23");
  assert.equal(r.modelo, "sonnet");
  assert.equal(r.situacao, "rodando");
  assert.equal(new Date(r.inicio).getTime(), new Date("2026-10-27T00:20:39-03:00").getTime());
  assert.equal(r.fim, null);
});

test("rodada vazia há mais de 4 h é interrompida", () => {
  const r = lerRodada("23-20261026-180000-sonnet.json", "", new Date("2026-10-26T18:00:01-03:00"), null, agora);
  assert.equal(r.situacao, "interrompida");
});

test("rodada que o run-task encerrou por tempo aparece interrompida na hora", () => {
  const meta = { tetoUsd: 5, motivo: "x", interrompidaEm: "2026-10-27T04:47:11-03:00" };
  const r = lerRodada("31-20261027-034711-sonnet.json", "", new Date("2026-10-27T03:47:12-03:00"), meta, new Date("2026-10-27T04:48:00-03:00"));
  assert.equal(r.situacao, "interrompida");
});

test("rodada terminada traz custo, turnos e fim pela duração", () => {
  const json = JSON.stringify({ total_cost_usd: 5.95, num_turns: 101, duration_ms: 985240, is_error: false });
  const r = lerRodada("25-20261026-234339-sonnet.json", json, new Date(), { tetoUsd: 8, motivo: "segunda rodada" }, agora);
  assert.equal(r.situacao, "terminada");
  assert.equal(r.custoUsd, 5.95);
  assert.equal(r.turnos, 101);
  assert.equal(r.tetoUsd, 8);
  assert.equal(r.nota, "segunda rodada");
  assert.equal(Math.round(r.minutos * 10) / 10, 16.4);
});

const tarefas = [
  { id: "22", titulo: "Fundação", modelo: "haiku", peso: "P", dependeDe: [] },
  { id: "23", titulo: "Login", modelo: "sonnet", peso: "G", dependeDe: ["22"] },
  { id: "24", titulo: "Permissões", modelo: "sonnet", peso: "M", dependeDe: ["23"] },
  { id: "25", titulo: "Leads", modelo: "sonnet", peso: "M", dependeDe: [] },
  { id: "27", titulo: "Assumir", modelo: "sonnet", peso: "G", dependeDe: [] },
  { id: "02", titulo: "Webhook", modelo: "sonnet", peso: "M", dependeDe: [] },
];
const terminada = (tarefa, n, custo, inicio) =>
  ({ chave: `${tarefa}-${n}`, tarefa, rodada: n, modelo: tarefa === "22" ? "haiku" : "sonnet", inicio, fim: inicio, minutos: 20, custoUsd: custo, turnos: 100, tetoUsd: tarefa === "22" ? 2 : 8, situacao: "terminada", nota: null });
const rodadas = [
  terminada("22", 1, 0.72, "2026-10-26T23:22:55-03:00"),
  terminada("22", 2, 0.14, "2026-10-26T23:35:04-03:00"),
  terminada("25", 1, 6.64, "2026-10-26T23:22:56-03:00"),
  terminada("25", 2, 5.95, "2026-10-26T23:43:39-03:00"),
  terminada("23", 1, 7.69, "2026-10-27T00:01:02-03:00"),
  { ...terminada("23", 2, null, "2026-10-27T00:20:39-03:00"), fim: null, minutos: null, custoUsd: null, situacao: "rodando" },
  terminada("27", 1, 7.18, "2026-10-27T00:01:03-03:00"),
];
const git = {
  branches: ["task/02-webhook-asaas", "task/22-admin-fundacao", "task/23-admin-login-sessao", "task/25-core-api-leads", "task/27-conversation-assumir"],
  worktrees: ["task/23-admin-login-sessao", "task/27-conversation-assumir"],
};

test("estado da tarefa vem do git e das rodadas", () => {
  const e = derivarEstado({ tarefas, rodadas, git, dados: {}, agora });
  const estado = Object.fromEntries(e.tarefas.map(t => [t.id, t.estado]));
  assert.deepEqual(estado, { "22": "concluida", "23": "rodando", "24": "aberta", "25": "concluida", "27": "em_revisao", "02": "concluida" });
  assert.equal(e.tarefas.find(t => t.id === "02").executor, "em linha");
  assert.equal(e.tarefas.find(t => t.id === "25").executor, "headless");
});

test("resultado de cada rodada: reprovada, incompleta no teto, aprovada, aguardando revisão", () => {
  const e = derivarEstado({ tarefas, rodadas, git, dados: {}, agora });
  const res = Object.fromEntries(e.rodadas.map(r => [r.chave, r.resultado]));
  assert.equal(res["22-1"], "reprovada");
  assert.equal(res["22-2"], "aprovada");
  assert.equal(res["23-1"], "incompleta");
  assert.equal(res["23-2"], "rodando");
  assert.equal(res["27-1"], "aguardando_revisao");
});

test("resumo: progresso pelo peso e projeção pela média real das rodadas", () => {
  const e = derivarEstado({ tarefas, rodadas, git, dados: {}, agora });
  // pesos: P 30, M 60, G 120 → concluídas 22 (30) + 25 (60) + 02 (60) = 150 de 450
  assert.equal(Math.round(e.resumo.pctGeral * 1000) / 1000, 0.333);
  assert.equal(e.resumo.rodando, 1);
  assert.equal(e.resumo.emRevisao, 1);
  assert.equal(Math.round(e.resumo.gastoUsd * 100) / 100, 28.32);
  // média sonnet por rodada terminada: (6.64 + 5.95 + 7.69 + 7.18) / 4 = 6.865; 2 rodadas por tarefa (22 e 25)
  // restante: 23 rodando (1) + 24 aberta (2) + 27 em revisão (1) = 4 rodadas sonnet
  assert.equal(Math.round(e.resumo.restanteUsd * 100) / 100, 27.46);
});

test("fila diz o que cada tarefa aguarda", () => {
  const e = derivarEstado({ tarefas, rodadas, git, dados: {}, agora });
  const fila = Object.fromEntries(e.fila.map(f => [f.id, f]));
  assert.equal(fila["24"].situacao, "aguardando");
  assert.deepEqual(fila["24"].aguarda, ["23"]);
  assert.equal(fila["27"].situacao, "em_revisao");
});

test("dados manuais completam teto e nota das rodadas antigas e marcam o marco", () => {
  const dados = { rodadas: { "23-2": { tetoUsd: 10, nota: "MockMvc" } }, marcos: [{ nome: "4 Painel", de: 22, ate: 35 }] };
  const e = derivarEstado({ tarefas, rodadas, git, dados, agora });
  const r = e.rodadas.find(x => x.chave === "23-2");
  assert.equal(r.tetoUsd, 10);
  assert.equal(r.nota, "MockMvc");
  assert.equal(e.tarefas.find(t => t.id === "23").marco, "4 Painel");
  assert.equal(e.tarefas.find(t => t.id === "02").marco, "Outras");
});

// Git com a informação de merge: o que entrou na main, o que só tem commit no branch e o que
// tem mudança sem commit no worktree.
const gitComMerge = {
  branches: ["task/22-admin-fundacao", "task/23-admin-login-sessao", "task/27-conversation-assumir"],
  worktrees: ["task/23-admin-login-sessao", "task/27-conversation-assumir"],
  mesclados: ["22", "25"],
  sujos: ["task/27-conversation-assumir"],
};

test("com informação de merge: mesclada é concluída mesmo sem branch; branch com commit é aguardando merge", () => {
  const e = derivarEstado({ tarefas, rodadas: rodadas.filter(r => r.situacao !== "rodando"), git: gitComMerge, dados: {}, agora });
  const estado = Object.fromEntries(e.tarefas.map(t => [t.id, t.estado]));
  assert.equal(estado["25"], "concluida", "branch apagado depois do merge continua concluída");
  assert.equal(estado["22"], "concluida");
  assert.equal(estado["23"], "aguardando_merge", "worktree limpo e commit no branch: aprovada, PR aberto");
  assert.equal(estado["27"], "em_revisao", "worktree com mudança sem commit");
  assert.equal(estado["24"], "aberta");
  assert.equal(e.resumo.aguardandoMerge, 1);
});

test("última rodada de tarefa aguardando merge ou concluída é aprovada; em revisão aguarda revisão", () => {
  const e = derivarEstado({ tarefas, rodadas: rodadas.filter(r => r.situacao !== "rodando"), git: gitComMerge, dados: {}, agora });
  const res = Object.fromEntries(e.rodadas.map(r => [r.chave, r.resultado]));
  assert.equal(res["25-2"], "aprovada");
  assert.equal(res["27-1"], "aguardando_revisao");
  const fila = Object.fromEntries(e.fila.map(f => [f.id, f]));
  assert.equal(fila["23"].situacao, "aguardando_merge");
  assert.equal(fila["23"].custoEstimadoUsd, 0, "nada mais a gastar numa tarefa aprovada");
  assert.deepEqual(fila["24"].aguarda, [], "dependência aprovada não bloqueia a próxima");
});

test("rodada interrompida tem fim: meta, senão início da próxima rodada da tarefa, senão início + 4 h", () => {
  const interrompida = (tarefa, n, inicio, extra = {}) =>
    ({ ...terminada(tarefa, n, null, inicio), fim: null, minutos: null, custoUsd: null, situacao: "interrompida", ...extra });
  const rs = [
    interrompida("31", 2, "2026-10-27T03:47:11-03:00"),
    terminada("31", 3, 0.85, "2026-10-27T09:32:53-03:00"),
    interrompida("33", 1, "2026-10-27T10:00:00-03:00"),
    interrompida("34", 1, "2026-10-27T11:00:00-03:00", { fim: "2026-10-27T11:30:00-03:00", fimEstimado: false }),
  ];
  const ts = [{ id: "31", titulo: "a", modelo: "sonnet", peso: "M", dependeDe: [] }, { id: "33", titulo: "b", modelo: "sonnet", peso: "M", dependeDe: [] }, { id: "34", titulo: "c", modelo: "sonnet", peso: "M", dependeDe: [] }];
  const e = derivarEstado({ tarefas: ts, rodadas: rs, git: { branches: [], worktrees: [] }, dados: {}, agora });
  const r = Object.fromEntries(e.rodadas.map(x => [x.chave, x]));
  assert.equal(new Date(r["31-1"].fim).toISOString(), new Date("2026-10-27T09:32:53-03:00").toISOString());
  assert.equal(r["31-1"].fimEstimado, true, "as rodadas são renumeradas pela ordem: a interrompida é a 31-1");
  assert.equal(new Date(r["33-1"].fim).toISOString(), new Date("2026-10-27T14:00:00-03:00").toISOString());
  assert.equal(new Date(r["34-1"].fim).toISOString(), new Date("2026-10-27T11:30:00-03:00").toISOString(), "fim gravado pelo run-task prevalece");
  assert.equal(r["34-1"].fimEstimado, false);
});

test("lerRodada usa interrompidaEm do meta como fim da rodada encerrada por tempo", () => {
  const r = lerRodada("31-20261027-100000-sonnet.json", "", new Date("2026-10-27T10:00:00-03:00"),
    { interrompidaEm: "2026-10-27T11:15:00-03:00" }, new Date("2026-10-27T12:00:00-03:00"));
  assert.equal(r.situacao, "interrompida");
  assert.equal(new Date(r.fim).toISOString(), new Date("2026-10-27T11:15:00-03:00").toISOString());
  assert.equal(r.fimEstimado, false);
});
