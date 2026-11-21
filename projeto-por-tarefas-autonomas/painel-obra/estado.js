// Estado do painel da obra, derivado só do que o repositório já registra:
// tarefas (tasks/*.md), rodadas dos executores (runs/*.json) e o git (branches e worktrees).
// Funções puras: o servidor lê os arquivos e o git e passa tudo para cá.

const MINUTOS_POR_PESO = { P: 30, M: 60, G: 120 };
const TETO_PADRAO = { haiku: 2, sonnet: 8, opus: 20 };
const HORAS_ATE_INTERROMPIDA = 4;
// Rodada que gastou quase todo o teto parou por orçamento, não por ter terminado o trabalho.
const FRACAO_DO_TETO_INCOMPLETA = 0.95;

function lerFrontmatter(texto) {
  const bloco = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (!bloco) return null;
  const campo = nome => {
    const m = new RegExp(`^${nome}\\s*:\\s*(.*)$`, "m").exec(bloco[1]);
    return m ? m[1].trim() : "";
  };
  const semAspas = v => v.replace(/^"(.*)"$/, "$1");
  return {
    id: semAspas(campo("id")),
    titulo: semAspas(campo("title")),
    modelo: semAspas(campo("model")),
    peso: semAspas(campo("weight")),
    dependeDe: [...campo("depends_on").matchAll(/"([^"]+)"/g)].map(m => m[1]),
  };
}

// Nome do arquivo: NN-AAAAMMDD-HHmmss-modelo.json, com a hora local da máquina que disparou.
function lerRodada(nomeArquivo, conteudo, modificadoEm, meta, agora) {
  const m = /^(\d+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\w+)\.json$/.exec(nomeArquivo);
  if (!m) return null;
  const [, tarefa, a, mes, d, h, mi, s, modelo] = m;
  const inicio = new Date(+a, +mes - 1, +d, +h, +mi, +s);
  let json = null;
  try { json = JSON.parse(String(conteudo).replace(/^﻿/, "")); } catch { json = null; }
  const base = {
    tarefa, modelo, inicio: inicio.toISOString(),
    tetoUsd: meta?.tetoUsd ?? TETO_PADRAO[modelo] ?? null,
    nota: meta?.motivo ?? null,
  };
  if (!json || json.duration_ms == null) {
    // O run-task grava interrompidaEm quando encerra o executor por tempo; senão, 4 h sem escrever.
    const parado = Boolean(meta?.interrompidaEm) || agora - modificadoEm > HORAS_ATE_INTERROMPIDA * 3600 * 1000;
    // Encerrada por tempo: o run-task grava a hora; sem ela, derivarEstado estima o fim.
    const fim = meta?.interrompidaEm ? new Date(meta.interrompidaEm).toISOString() : null;
    return { ...base, fim, fimEstimado: false, minutos: fim ? (new Date(fim) - inicio) / 60000 : null, custoUsd: null, turnos: null, situacao: parado ? "interrompida" : "rodando" };
  }
  return {
    ...base,
    fim: new Date(inicio.getTime() + json.duration_ms).toISOString(),
    minutos: json.duration_ms / 60000,
    custoUsd: json.total_cost_usd ?? null,
    turnos: json.num_turns ?? null,
    situacao: json.is_error ? "erro" : "terminada",
  };
}

const soma = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);
const idDoBranch = b => (/^task\/(\d+)-/.exec(b) || [])[1];

function derivarEstado({ tarefas, rodadas, git, dados = {}, agora }) {
  const comBranch = new Set(git.branches.map(idDoBranch).filter(Boolean));
  const comWorktree = new Set(git.worktrees.map(idDoBranch).filter(Boolean));
  // Com informação de merge (git.mesclados): concluída é o que entrou na main; branch com commit e
  // worktree limpo é aprovada esperando o merge; worktree com mudança sem commit está em revisão.
  const comMerge = Array.isArray(git.mesclados);
  const mesclados = new Set(git.mesclados || []);
  const sujos = new Set((git.sujos || []).map(idDoBranch).filter(Boolean));
  const marcoDe = id => {
    const n = Number(id);
    return (dados.marcos || []).find(m => n >= m.de && n <= m.ate)?.nome ?? "Outras";
  };

  // Numera as rodadas de cada tarefa pela ordem de início e completa com os dados manuais.
  const ordenadas = [...rodadas].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const contagem = {};
  const rs = ordenadas.map(r => {
    const rodada = (contagem[r.tarefa] = (contagem[r.tarefa] || 0) + 1);
    const chave = `${r.tarefa}-${rodada}`;
    const extra = dados.rodadas?.[chave] || {};
    return { ...r, rodada, chave, tetoUsd: extra.tetoUsd ?? r.tetoUsd, nota: extra.nota ?? r.nota };
  });
  // Interrompida sem hora gravada (travou antes do limite de tempo existir): termina no início da
  // próxima rodada da mesma tarefa, que é quando o orquestrador a encerrou; sem próxima, início + 4 h.
  for (const r of rs) {
    if (r.situacao !== "interrompida" || r.fim) continue;
    const proxima = rs.find(x => x.tarefa === r.tarefa && x.rodada === r.rodada + 1);
    const fim = proxima ? new Date(proxima.inicio) : new Date(new Date(r.inicio).getTime() + HORAS_ATE_INTERROMPIDA * 3600 * 1000);
    r.fim = fim.toISOString();
    r.fimEstimado = true;
    r.minutos = (fim - new Date(r.inicio)) / 60000;
  }

  const estadoDe = id => {
    if (rs.some(r => r.tarefa === id && r.situacao === "rodando")) return "rodando";
    if (comMerge) {
      if (mesclados.has(id)) return "concluida";
      if (sujos.has(id)) return "em_revisao";
      if (comBranch.has(id)) return "aguardando_merge";
      return "aberta";
    }
    if (comWorktree.has(id)) return "em_revisao";
    if (comBranch.has(id)) return "concluida";
    return "aberta";
  };
  const ts = tarefas.map(t => ({
    ...t,
    marco: marcoDe(t.id),
    estimativaMin: MINUTOS_POR_PESO[t.peso] ?? 60,
    estado: estadoDe(t.id),
    executor: rs.some(r => r.tarefa === t.id) ? "headless" : "em linha",
  }));
  const estado = Object.fromEntries(ts.map(t => [t.id, t.estado]));

  for (const r of rs) {
    const ultima = r.rodada === contagem[r.tarefa];
    if (r.situacao !== "terminada") { r.resultado = r.situacao; continue; }
    if (r.tetoUsd && r.custoUsd >= FRACAO_DO_TETO_INCOMPLETA * r.tetoUsd) { r.resultado = "incompleta"; continue; }
    if (!ultima) { r.resultado = "reprovada"; continue; }
    r.resultado = ["concluida", "aguardando_merge"].includes(estado[r.tarefa]) ? "aprovada" : "aguardando_revisao";
  }

  const terminadas = rs.filter(r => r.situacao === "terminada");
  const media = (modelo, campo) => {
    const doModelo = terminadas.filter(r => r.modelo === modelo);
    const base = doModelo.length ? doModelo : terminadas.filter(r => r.modelo === "sonnet");
    if (!base.length) return campo === "custoUsd" ? (TETO_PADRAO[modelo] ?? 8) * 0.8 : 20;
    return soma(base, r => r[campo]) / base.length;
  };
  const concluidasHeadless = ts.filter(t => t.estado === "concluida" && t.executor === "headless");
  const rodadasPorTarefa = concluidasHeadless.length
    ? rs.filter(r => concluidasHeadless.some(t => t.id === r.tarefa)).length / concluidasHeadless.length
    : 2;
  const faltam = t => (t.estado === "aguardando_merge" ? 0 : t.estado === "rodando" || t.estado === "em_revisao" ? 1 : rodadasPorTarefa);
  const pronta = id => !estado[id] || ["concluida", "aguardando_merge"].includes(estado[id]);

  const pendentes = ts.filter(t => t.estado !== "concluida");
  const fila = pendentes.map(t => {
    const aguarda = t.dependeDe.filter(d => !pronta(d));
    return {
      id: t.id, titulo: t.titulo, modelo: t.modelo, marco: t.marco,
      situacao: t.estado === "aberta" ? (aguarda.length ? "aguardando" : "pronta") : t.estado,
      aguarda,
      custoEstimadoUsd: faltam(t) * media(t.modelo, "custoUsd"),
      minutosEstimados: faltam(t) * media(t.modelo, "minutos"),
    };
  });

  const concluidas = ts.filter(t => t.estado === "concluida");
  const marcos = [...new Set(ts.map(t => t.marco))];
  const porMarco = marcos.map(nome => {
    const xs = ts.filter(t => t.marco === nome);
    const feitas = xs.filter(t => t.estado === "concluida");
    return { marco: nome, concluidas: feitas.length, total: xs.length, pct: soma(feitas, t => t.estimativaMin) / soma(xs, t => t.estimativaMin) };
  });

  return {
    geradoEm: agora.toISOString(),
    tarefas: ts,
    rodadas: rs,
    fila,
    porMarco,
    registros: dados.registros || [],
    resumo: {
      total: ts.length,
      concluidas: concluidas.length,
      rodando: ts.filter(t => t.estado === "rodando").length,
      emRevisao: ts.filter(t => t.estado === "em_revisao").length,
      aguardandoMerge: ts.filter(t => t.estado === "aguardando_merge").length,
      abertas: ts.filter(t => t.estado === "aberta").length,
      pctGeral: soma(concluidas, t => t.estimativaMin) / (soma(ts, t => t.estimativaMin) || 1),
      gastoUsd: soma(terminadas, r => r.custoUsd),
      rodadasTerminadas: terminadas.length,
      rodadasPorTarefa,
      restanteUsd: soma(fila, f => f.custoEstimadoUsd),
      restanteHoras: soma(fila, f => f.minutosEstimados) / 60,
      registrosAbertos: (dados.registros || []).filter(r => r.situacao === "aberta").length,
    },
  };
}

module.exports = { lerFrontmatter, lerRodada, derivarEstado, TETO_PADRAO };
