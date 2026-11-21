// Servidor local do painel da obra: página, estado em JSON e mudanças ao vivo por SSE.
// Sem dependências. Uso: node scripts/painel-obra/servidor.js   (PAINEL_PORTA, padrão 4440)
const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST_PADRAO = "127.0.0.1";
const PORTA_PADRAO = 4440;
const BATIMENTO_MS = 20000;

// O que muda o painel; o horário da coleta fica de fora para não disparar evento à toa.
const assinatura = estado => JSON.stringify({ ...estado, geradoEm: undefined });

function criarServidor({ coletar, intervaloMs = 2000, html }) {
  const clientes = new Set();
  let atual = coletar();
  let ultima = assinatura(atual);

  const enviar = (res, evento, dados) => res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);

  const verificar = setInterval(() => {
    try {
      const novo = coletar();
      const a = assinatura(novo);
      atual = novo;
      if (a !== ultima) {
        ultima = a;
        for (const res of clientes) enviar(res, "estado", novo);
      }
    } catch (e) {
      for (const res of clientes) enviar(res, "erro", { mensagem: e.message });
    }
  }, intervaloMs);
  const batimento = setInterval(() => { for (const res of clientes) res.write(": vivo\n\n"); }, BATIMENTO_MS);

  const servidor = http.createServer((req, res) => {
    const rota = req.url.split("?")[0];
    if (rota === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(typeof html === "function" ? html() : html);
    }
    if (rota === "/estado") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(atual));
    }
    if (rota === "/eventos") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 3000\n\n");
      enviar(res, "estado", atual);
      clientes.add(res);
      req.on("close", () => clientes.delete(res));
      return undefined;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Não encontrado");
  });

  servidor.parar = () => {
    clearInterval(verificar);
    clearInterval(batimento);
    for (const res of clientes) res.end();
    servidor.close();
  };
  return servidor;
}

module.exports = { criarServidor, HOST_PADRAO };

if (require.main === module) {
  const { coletar } = require("./coletar.js");
  const raiz = path.resolve(__dirname, "..", "..");
  const pagina = path.join(__dirname, "index.html");
  const porta = Number(process.env.PAINEL_PORTA) || PORTA_PADRAO;
  // A página é lida a cada pedido: editar o index.html vale no próximo F5, sem reiniciar.
  const srv = criarServidor({ coletar: () => coletar(raiz), html: () => fs.readFileSync(pagina, "utf8") });
  srv.listen(porta, HOST_PADRAO, () => console.log(`Painel da obra em http://localhost:${porta} (Ctrl+C para parar)`));
}
