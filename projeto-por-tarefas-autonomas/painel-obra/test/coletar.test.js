// Testes da leitura do repositório (tarefas, runs, dados manuais) com git falso.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { coletar } = require("../coletar.js");

function repoDeExemplo() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "painel-obra-"));
  fs.mkdirSync(path.join(raiz, "tasks"));
  fs.mkdirSync(path.join(raiz, "runs"));
  fs.mkdirSync(path.join(raiz, "scripts", "painel-obra"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "tasks", "22-admin.md"), "---\nid: \"22\"\ntitle: Fundação\nmodel: haiku\nweight: P\ndepends_on: []\n---\n");
  fs.writeFileSync(path.join(raiz, "tasks", "23-login.md"), "﻿---\nid: \"23\"\ntitle: Login\nmodel: sonnet\nweight: G\ndepends_on: [\"22\"]\n---\n");
  fs.writeFileSync(path.join(raiz, "tasks", "README.md"), "sem frontmatter");
  fs.writeFileSync(path.join(raiz, "runs", "22-20261026-232255-haiku.json"),
    JSON.stringify({ total_cost_usd: 0.72, num_turns: 68, duration_ms: 608645, is_error: false }));
  fs.writeFileSync(path.join(raiz, "runs", "23-20261027-002039-sonnet.json"), "");
  fs.writeFileSync(path.join(raiz, "runs", "23-20261027-002039-sonnet.meta.json"),
    JSON.stringify({ tarefa: "23", modelo: "sonnet", tetoUsd: 10, motivo: "MockMvc" }));
  fs.writeFileSync(path.join(raiz, "runs", "23-20261027-002039-sonnet.stderr.log"), "");
  fs.writeFileSync(path.join(raiz, "scripts", "painel-obra", "dados.json"),
    JSON.stringify({ marcos: [{ nome: "4 Painel", de: 22, ate: 35 }], registros: [{ id: "Q01", tipo: "Dúvida aberta", situacao: "aberta" }] }));
  return raiz;
}

const gitFalso = () => ({ branches: ["task/22-admin-fundacao", "task/23-admin-login-sessao"], worktrees: ["task/23-admin-login-sessao"] });

test("coleta tarefas, rodadas com meta, git e dados manuais", () => {
  const raiz = repoDeExemplo();
  const e = coletar(raiz, gitFalso, new Date("2026-10-27T00:30:00-03:00"));
  assert.deepEqual(e.tarefas.map(t => t.id), ["22", "23"]);
  assert.equal(e.tarefas.find(t => t.id === "22").estado, "concluida");
  assert.equal(e.tarefas.find(t => t.id === "23").estado, "rodando");
  const r23 = e.rodadas.find(r => r.tarefa === "23");
  assert.equal(r23.tetoUsd, 10);
  assert.equal(r23.nota, "MockMvc");
  assert.equal(e.rodadas.length, 2, "meta e stderr não contam como rodada");
  assert.equal(e.resumo.registrosAbertos, 1);
  assert.equal(e.tarefas[0].marco, "4 Painel");
});

test("nome do projeto vem do dados.json e, sem ele, da pasta do repositório", () => {
  const raiz = repoDeExemplo();
  assert.equal(coletar(raiz, gitFalso, new Date()).projeto, path.basename(raiz));
  fs.writeFileSync(path.join(raiz, "scripts", "painel-obra", "dados.json"), JSON.stringify({ projeto: "Meu App" }));
  assert.equal(coletar(raiz, gitFalso, new Date()).projeto, "Meu App");
});

test("sem runs, sem dados e git falhando, ainda devolve um estado", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "painel-obra-vazio-"));
  fs.mkdirSync(path.join(raiz, "tasks"));
  const e = coletar(raiz, () => { throw new Error("git ausente"); }, new Date());
  assert.deepEqual(e.tarefas, []);
  assert.deepEqual(e.rodadas, []);
  assert.match(e.aviso, /git/);
});

test("lê o histórico por dia e soma as rodadas de cada dia pela hora de início", () => {
  const raiz = repoDeExemplo();
  fs.mkdirSync(path.join(raiz, "docs"));
  fs.writeFileSync(path.join(raiz, "docs", "historico.txt"),
    "HISTÓRICO\n\n======== 26/10/2026 (segunda) ========\nOBJETIVO  Fundação do admin\n  23:00  TAREFA     22 criada\n");
  const e = coletar(raiz, gitFalso, new Date("2026-10-27T00:30:00-03:00"));
  assert.deepEqual(e.historico.map(d => d.data), ["2026-10-27", "2026-10-26"]);
  assert.equal(e.historico[1].objetivo, "Fundação do admin");
  const dia26 = e.historico[1].rodadasDoDia;
  assert.equal(dia26.quantidade, 1, "a rodada 22 começou em 26/10; a 23 em 27/10");
  assert.equal(dia26.custoUsd, 0.72);
  assert.ok(Math.abs(dia26.minutos - 10.14) < 0.01);
});

test("dia que só tem rodadas (sem nada anotado) aparece no histórico", () => {
  const raiz = repoDeExemplo();
  const e = coletar(raiz, gitFalso, new Date("2026-10-27T00:30:00-03:00"));
  assert.deepEqual(e.historico.map(d => d.data), ["2026-10-27", "2026-10-26"]);
  assert.equal(e.historico[0].linhas.length, 0);
  assert.equal(e.historico[0].rodadasDoDia.quantidade, 1);
});

test("gitDoRepositorio informa mesclados (branch mesclado ou citado em merge da main) e worktrees sujos", () => {
  const { gitDoRepositorio } = require("../coletar.js");
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "painel-git-"));
  const { execFileSync } = require("child_process");
  const g = (...a) => execFileSync("git", ["-C", raiz, ...a], { encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@t"); g("config", "user.name", "t");
  fs.writeFileSync(path.join(raiz, "a.txt"), "a"); g("add", "."); g("commit", "-qm", "base");
  // 01: mesclado e branch apagado (só a mensagem do merge sobra)
  g("checkout", "-qb", "task/01-um"); fs.writeFileSync(path.join(raiz, "b.txt"), "b"); g("add", "."); g("commit", "-qm", "um");
  g("checkout", "-q", "main"); g("merge", "-q", "--no-ff", "-m", "Merge pull request #1 from org/task/01-um", "task/01-um"); g("branch", "-qD", "task/01-um");
  // 02: commit no branch, sem merge, com worktree limpo
  g("branch", "-q", "task/02-dois"); g("checkout", "-q", "task/02-dois"); fs.writeFileSync(path.join(raiz, "c.txt"), "c"); g("add", "."); g("commit", "-qm", "dois"); g("checkout", "-q", "main");
  const wt2 = raiz + "-wt2"; g("worktree", "add", "-q", wt2, "task/02-dois");
  // 03: worktree com mudança sem commit
  const wt3 = raiz + "-wt3"; g("worktree", "add", "-q", "-b", "task/03-tres", wt3, "main");
  fs.writeFileSync(path.join(wt3, "d.txt"), "d");
  const r = gitDoRepositorio(raiz);
  assert.deepEqual(r.mesclados.sort(), ["01"]);
  assert.deepEqual(r.sujos, ["task/03-tres"]);
  assert.ok(r.branches.includes("task/02-dois"));
});
