// Lê do disco o que o painel da obra precisa e entrega a derivarEstado.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { lerFrontmatter, lerRodada, derivarEstado } = require("./estado.js");
const { lerHistorico } = require("./historico.js");

const NOME_RODADA = /^\d+-\d{8}-\d{6}-\w+\.json$/;

function lerJson(arquivo) {
  try { return JSON.parse(fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "")); } catch { return null; }
}

// Branches task/* e os branches com worktree aberto (fora a pasta principal).
function gitDoRepositorio(raiz) {
  const git = (...args) => execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8", windowsHide: true });
  const branches = git("for-each-ref", "--format=%(refname:short)", "refs/heads/task/").split(/\r?\n/).filter(Boolean);
  const blocos = git("worktree", "list", "--porcelain").split(/\r?\n\r?\n/).slice(1);
  const caminhos = blocos.map(b => ({ dir: (/^worktree (.+)$/m.exec(b) || [])[1], branch: (/^branch refs\/heads\/(.+)$/m.exec(b) || [])[1] }))
    .filter(w => w.dir && w.branch);
  const worktrees = caminhos.map(w => w.branch);
  // Mesclada na main: branch ainda listado como mesclado, ou citado numa mensagem de merge da main
  // (o branch costuma ser apagado depois do PR).
  // Branch recém-criado da main (sem commit próprio) também aparece em --merged; só conta o que
  // entrou por merge, isto é, cujo topo não está na linha principal da main.
  const idDe = s => (/task\/(\d+)-/.exec(s) || [])[1];
  const linhaPrincipal = new Set(git("rev-list", "--first-parent", "main").split(/\r?\n/).filter(Boolean));
  const mescladosPorBranch = git("branch", "--merged", "main", "--format=%(refname:short) %(objectname)").split(/\r?\n/)
    .map(l => l.split(" ")).filter(([b, sha]) => b && b.startsWith("task/") && !linhaPrincipal.has(sha)).map(([b]) => b);
  const mesclados = new Set([...mescladosPorBranch, ...git("log", "main", "--merges", "--format=%s").split(/\r?\n/)].map(idDe).filter(Boolean));
  const sujos = caminhos.filter(w => {
    try { return execFileSync("git", ["-C", w.dir, "status", "--porcelain"], { encoding: "utf8", windowsHide: true }).trim() !== ""; } catch { return false; }
  }).map(w => w.branch);
  return { branches, worktrees, mesclados: [...mesclados], sujos };
}

function coletar(raiz, lerGit = () => gitDoRepositorio(raiz), agora = new Date()) {
  const pastaTarefas = path.join(raiz, "tasks");
  const tarefas = (fs.existsSync(pastaTarefas) ? fs.readdirSync(pastaTarefas) : [])
    .filter(f => f.endsWith(".md"))
    .sort()
    .map(f => lerFrontmatter(fs.readFileSync(path.join(pastaTarefas, f), "utf8")))
    .filter(t => t && t.id);

  const pastaRuns = path.join(raiz, "runs");
  const rodadas = (fs.existsSync(pastaRuns) ? fs.readdirSync(pastaRuns) : [])
    .filter(f => NOME_RODADA.test(f))
    .map(f => {
      const arquivo = path.join(pastaRuns, f);
      const meta = lerJson(arquivo.replace(/\.json$/, ".meta.json"));
      return lerRodada(f, fs.readFileSync(arquivo, "utf8"), fs.statSync(arquivo).mtime, meta, agora);
    })
    .filter(Boolean);

  let git = { branches: [], worktrees: [] };
  let aviso = null;
  try { git = lerGit(); } catch (e) { aviso = `Não consegui ler o git: ${e.message}`; }

  const dados = lerJson(path.join(raiz, "scripts", "painel-obra", "dados.json")) || {};
  const estado = derivarEstado({ tarefas, rodadas, git, dados, agora });
  const arquivoHistorico = path.join(raiz, "docs", "historico.txt");
  const texto = fs.existsSync(arquivoHistorico) ? fs.readFileSync(arquivoHistorico, "utf8") : "";
  const projeto = dados.projeto || path.basename(path.resolve(raiz));
  return { ...estado, projeto, historico: historicoComRodadas(lerHistorico(texto), estado.rodadas), aviso };
}

// Data local (AAAA-MM-DD) do início da rodada, a mesma régua dos blocos do histórico.
const dataLocal = iso => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Junta a cada dia o total das rodadas que começaram nele; dia só com rodadas também entra.
function historicoComRodadas(dias, rodadas) {
  const porDia = new Map(dias.map(d => [d.data, { ...d }]));
  for (const r of rodadas) {
    const data = dataLocal(r.inicio);
    if (!porDia.has(data)) porDia.set(data, { data, rotulo: data.split("-").reverse().join("/"), objetivo: null, linhas: [] });
  }
  return [...porDia.values()]
    .map(d => {
      const doDia = rodadas.filter(r => dataLocal(r.inicio) === d.data);
      return {
        ...d,
        rodadasDoDia: {
          quantidade: doDia.length,
          custoUsd: doDia.reduce((a, r) => a + (r.custoUsd || 0), 0),
          minutos: doDia.reduce((a, r) => a + (r.minutos || 0), 0),
        },
      };
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

module.exports = { coletar, gitDoRepositorio };
