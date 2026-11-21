// Testes do histórico da obra (docs/historico.txt): anotar linhas no dia certo e ler por dia.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { anotar, lerHistorico, TIPOS } = require("../historico.js");

const CABECALHO = "HISTÓRICO DA OBRA: exemplo\n";

test("cabeçalho de arquivo novo leva o nome do projeto", () => {
  const texto = anotar("", new Date(2026, 9, 28, 9, 5), "NOTA", "x", "meu-app");
  assert.match(texto, /^HISTÓRICO DA OBRA: meu-app\n/);
});

test("anotar em arquivo vazio cria o cabeçalho e o bloco do dia", () => {
  const texto = anotar("", new Date(2026, 9, 28, 9, 5), "PEDIDO", "Histórico por dia");
  assert.match(texto, /^HISTÓRICO DA OBRA/);
  assert.match(texto, /======== 28\/10\/2026 \(quarta\) ========\n/);
  assert.match(texto, /\n  09:05  PEDIDO     Histórico por dia\n$/);
});

test("anotar no mesmo dia acrescenta no fim do bloco, sem repetir o cabeçalho do dia", () => {
  let t = anotar(CABECALHO, new Date(2026, 9, 28, 9, 5), "PEDIDO", "a");
  t = anotar(t, new Date(2026, 9, 28, 10, 0), "TAREFA", "b");
  assert.equal(t.match(/======== 28\/10\/2026/g).length, 1);
  assert.ok(t.indexOf("PEDIDO     a") < t.indexOf("TAREFA     b"));
});

test("dia novo abre bloco novo depois do anterior", () => {
  let t = anotar(CABECALHO, new Date(2026, 9, 27, 23, 50), "NOTA", "fim");
  t = anotar(t, new Date(2026, 9, 28, 0, 10), "NOTA", "começo");
  assert.ok(t.indexOf("27/10/2026") < t.indexOf("28/10/2026"));
});

test("OBJETIVO vai logo abaixo do cabeçalho do dia, sem hora", () => {
  let t = anotar(CABECALHO, new Date(2026, 9, 28, 9, 5), "PEDIDO", "a");
  t = anotar(t, new Date(2026, 9, 28, 11, 0), "OBJETIVO", "Abas Leads e Clientes");
  const dia = lerHistorico(t)[0];
  assert.equal(dia.objetivo, "Abas Leads e Clientes");
  assert.deepEqual(dia.linhas.map(l => l.tipo), ["PEDIDO"]);
});

test("tipo desconhecido e texto com quebra de linha são recusados ou achatados", () => {
  assert.throws(() => anotar(CABECALHO, new Date(), "QUALQUER", "x"), /tipo/i);
  const t = anotar(CABECALHO, new Date(2026, 9, 28, 9, 5), "NOTA", "linha 1\nlinha 2");
  assert.match(t, /NOTA       linha 1 linha 2\n$/);
});

test("lerHistorico devolve dias do mais novo para o mais antigo, com linhas na ordem", () => {
  let t = anotar(CABECALHO, new Date(2026, 9, 27, 13, 0), "OBJETIVO", "Painel no ar");
  t = anotar(t, new Date(2026, 9, 27, 13, 1), "RODADA", "37#1 opus · 19 min · US$ 12,06 · reprovada");
  t = anotar(t, new Date(2026, 9, 27, 13, 45), "MERGE", "PR #45");
  t = anotar(t, new Date(2026, 9, 28, 9, 0), "PEDIDO", "histórico");
  const dias = lerHistorico(t);
  assert.deepEqual(dias.map(d => d.data), ["2026-10-28", "2026-10-27"]);
  assert.equal(dias[1].objetivo, "Painel no ar");
  assert.deepEqual(dias[1].linhas, [
    { hora: "13:01", tipo: "RODADA", texto: "37#1 opus · 19 min · US$ 12,06 · reprovada" },
    { hora: "13:45", tipo: "MERGE", texto: "PR #45" },
  ]);
});

test("lerHistorico ignora comentários e linhas soltas sem quebrar", () => {
  const t = CABECALHO + "# comentário\n\n======== 27/10/2026 (terça) ========\nlixo\n  13:45  MERGE      PR #45\n";
  const dias = lerHistorico(t);
  assert.equal(dias.length, 1);
  assert.deepEqual(dias[0].linhas.map(l => l.tipo), ["MERGE"]);
});

test("os tipos aceitos são os combinados", () => {
  assert.deepEqual(TIPOS, ["OBJETIVO", "PEDIDO", "DECISAO", "TAREFA", "RODADA", "REVISAO", "PR", "MERGE", "DEPLOY", "PROBLEMA", "NOTA"]);
});
