/* Service worker do Totem Everest — v3
   Correções desta versão:
   - NUNCA guarda resposta com erro (404/500) no cache. Era isso que deixava
     a página "quebrada" depois de atualizar os arquivos no GitHub.
   - A página sempre tenta a internet primeiro (limite de 7s) e só usa a
     cópia guardada se a internet falhar.
   - Aceita o comando "ATUALIZAR_AGORA" pra limpar tudo e assumir a versão nova.
*/
const VERSAO = 'v3';
const CACHE = 'totem-everest-' + VERSAO;
const ESSENCIAIS = ['./', './index.html', './manifest.json', './logo1.png'];
const LIMITE_MS = 7000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ESSENCIAIS.map(u => c.add(new Request(u, {cache:'reload'})))))
      .catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if(e.data === 'ATUALIZAR_AGORA'){
    caches.keys()
      .then(ks => Promise.all(ks.map(k => caches.delete(k))))
      .then(() => self.skipWaiting());
  }
});

function respostaBoa(r){
  return r && r.ok && r.status === 200 && (r.type === 'basic' || r.type === 'default');
}
function comLimite(promessa, ms){
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('tempo esgotado')), ms);
    promessa.then(v => { clearTimeout(t); ok(v); }, err => { clearTimeout(t); falha(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;   // Firebase e fontes passam direto

  const ehPagina = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  if(ehPagina){
    // internet primeiro: sempre pega a versão nova publicada no GitHub
    e.respondWith(
      comLimite(fetch(req, {cache:'no-store'}), LIMITE_MS)
        .then(r => {
          if(respostaBoa(r)){
            const copia = r.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copia)).catch(()=>{});
            return r;
          }
          // servidor devolveu erro: usa a última cópia BOA em vez de mostrar tela quebrada
          return caches.match('./index.html').then(m => m || r);
        })
        .catch(() => caches.match('./index.html').then(m => m || caches.match('./')))
    );
    return;
  }

  // demais arquivos: usa a cópia guardada e atualiza por trás
  e.respondWith(
    caches.match(req).then(cache => {
      const rede = fetch(req).then(r => {
        if(respostaBoa(r)){
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(()=>{});
        }
        return r;
      }).catch(() => cache);
      return cache || rede;
    })
  );
});
