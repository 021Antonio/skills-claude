// O servidor serve a página, o estado em JSON e empurra mudanças por SSE.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarServidor } = require("../servidor.js");

function estadoFalso() {
  let versao = 1;
  return {
    coletar: () => ({ geradoEm: new Date().toISOString(), resumo: { concluidas: versao } }),
    mudar: () => { versao += 1; },
  };
}

async function primeiroEvento(url, nome) {
  const resp = await fetch(url);
  const leitor = resp.body.getReader();
  let texto = "";
  while (!texto.includes(`event: ${nome}`) || !/\n\n/.test(texto.slice(texto.indexOf(`event: ${nome}`)))) {
    const { value, done } = await leitor.read();
    if (done) break;
    texto += Buffer.from(value).toString("utf8");
  }
  leitor.cancel();
  const bloco = texto.slice(texto.indexOf(`event: ${nome}`)).split("\n\n")[0];
  return JSON.parse(bloco.split("\n").find(l => l.startsWith("data: ")).slice(6));
}

test("serve página, estado em JSON e evento inicial", async () => {
  const e = estadoFalso();
  const srv = criarServidor({ coletar: e.coletar, intervaloMs: 50, html: "<p>painel</p>" });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.match(await (await fetch(base + "/")).text(), /painel/);
    assert.equal((await (await fetch(base + "/estado")).json()).resumo.concluidas, 1);
    assert.equal((await primeiroEvento(base + "/eventos", "estado")).resumo.concluidas, 1);
  } finally {
    srv.parar();
  }
});

test("mudança no repositório chega pelo SSE sem recarregar", async () => {
  const e = estadoFalso();
  const srv = criarServidor({ coletar: e.coletar, intervaloMs: 30, html: "" });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const resp = await fetch(base + "/eventos");
    const leitor = resp.body.getReader();
    let texto = "";
    setTimeout(e.mudar, 60);
    const limite = Date.now() + 3000;
    while (!texto.includes('"concluidas":2') && Date.now() < limite) {
      const { value, done } = await leitor.read();
      if (done) break;
      texto += Buffer.from(value).toString("utf8");
    }
    leitor.cancel();
    assert.match(texto, /"concluidas":2/);
  } finally {
    srv.parar();
  }
});

test("só escuta na própria máquina", () => {
  const { HOST_PADRAO } = require("../servidor.js");
  assert.equal(HOST_PADRAO, "127.0.0.1");
});
