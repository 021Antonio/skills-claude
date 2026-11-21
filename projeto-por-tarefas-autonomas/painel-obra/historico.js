// Histórico da obra em texto (docs/historico.txt): um bloco por dia, uma linha por acontecimento.
// Funções puras para anotar e ler; a linha de comando no fim acrescenta uma linha no arquivo.
//
// Formato:
//   ======== 28/10/2026 (quarta) ========
//   OBJETIVO  Abas Leads e Clientes
//     09:05  PEDIDO     texto
//
// Uso: node scripts/painel-obra/historico.js TIPO "texto"

const fs = require("fs");
const path = require("path");

const TIPOS = ["OBJETIVO", "PEDIDO", "DECISAO", "TAREFA", "RODADA", "REVISAO", "PR", "MERGE", "DEPLOY", "PROBLEMA", "NOTA"];
const cabecalho = projeto => `HISTÓRICO DA OBRA: ${projeto}\n`
  + "# Um bloco por dia. Linhas: hora, tipo e texto. Tipos: " + TIPOS.join(", ") + ".\n"
  + "# Anotar: node scripts/painel-obra/historico.js TIPO \"texto\" (o run-task anota as rodadas sozinho).\n";
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const RE_DIA = /^======== (\d{2})\/(\d{2})\/(\d{4}) \([^)]*\) ========$/;
const RE_OBJETIVO = /^OBJETIVO  (.*)$/;
const RE_LINHA = /^  (\d{2}:\d{2})  ([A-Z]+)\s+(.*)$/;

const doisDigitos = n => String(n).padStart(2, "0");
const rotuloDia = d => `======== ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} (${DIAS_SEMANA[d.getDay()]}) ========`;

function anotar(texto, agora, tipo, mensagem, projeto = "projeto") {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo desconhecido: ${tipo}. Use um de: ${TIPOS.join(", ")}`);
  const msg = String(mensagem).replace(/\s*\r?\n\s*/g, " ").trim();
  let linhas = (texto && texto.trim() ? texto.replace(/^﻿/, "") : cabecalho(projeto)).replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");

  const rotulo = rotuloDia(agora);
  let inicio = linhas.indexOf(rotulo);
  if (inicio === -1) {
    linhas.push("", rotulo);
    inicio = linhas.length - 1;
  }
  // Fim do bloco do dia: próxima linha de dia ou fim do arquivo (ignorando linhas em branco finais).
  let fim = linhas.findIndex((l, i) => i > inicio && RE_DIA.test(l));
  if (fim === -1) fim = linhas.length;
  while (fim - 1 > inicio && linhas[fim - 1].trim() === "") fim--;

  if (tipo === "OBJETIVO") {
    const existente = linhas.findIndex((l, i) => i > inicio && i < fim && RE_OBJETIVO.test(l));
    if (existente !== -1) linhas[existente] = `OBJETIVO  ${msg}`;
    else linhas.splice(inicio + 1, 0, `OBJETIVO  ${msg}`);
  } else {
    linhas.splice(fim, 0, `  ${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}  ${tipo.padEnd(9)}  ${msg}`);
  }
  return linhas.join("\n") + "\n";
}

function lerHistorico(texto) {
  const dias = [];
  let atual = null;
  for (const l of String(texto || "").replace(/^﻿/, "").split(/\r?\n/)) {
    const d = RE_DIA.exec(l);
    if (d) {
      atual = { data: `${d[3]}-${d[2]}-${d[1]}`, rotulo: l.replace(/=/g, "").trim(), objetivo: null, linhas: [] };
      dias.push(atual);
      continue;
    }
    if (!atual) continue;
    const o = RE_OBJETIVO.exec(l);
    if (o) { atual.objetivo = o[1].trim(); continue; }
    const m = RE_LINHA.exec(l);
    if (m && TIPOS.includes(m[2])) atual.linhas.push({ hora: m[1], tipo: m[2], texto: m[3].trim() });
  }
  return dias.sort((a, b) => b.data.localeCompare(a.data));
}

const ARQUIVO_PADRAO = path.resolve(__dirname, "..", "..", "docs", "historico.txt");

module.exports = { anotar, lerHistorico, TIPOS, ARQUIVO_PADRAO };

if (require.main === module) {
  const [tipo, ...resto] = process.argv.slice(2);
  if (!tipo || !resto.length) {
    console.error(`Uso: node scripts/painel-obra/historico.js TIPO "texto"   (tipos: ${TIPOS.join(", ")})`);
    process.exit(2);
  }
  const arquivo = process.env.HISTORICO_ARQUIVO || ARQUIVO_PADRAO;
  const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
  const projeto = path.basename(path.resolve(__dirname, "..", ".."));
  fs.writeFileSync(arquivo, anotar(atual, new Date(), tipo.toUpperCase(), resto.join(" "), projeto), "utf8");
}
