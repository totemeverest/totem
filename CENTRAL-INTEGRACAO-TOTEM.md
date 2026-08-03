# Totem Everest → Central Everest (estrutura ATUAL)

> Versão de 25/07/2026. **O sistema de prêmios mudou completamente** desde
> a primeira documentação: não existe mais "roleta única com um alvo".
> Agora são vários prêmios em paralelo, cada um com meta própria.

## Acesso

Firestore é a fonte da verdade. O tablet grava local (offline) e sincroniza
em tempo real. Leitura exige **login anônimo** (já ativado no projeto).

- **Projeto:** `totem-everest` (southamerica-east1)
- **Site:** https://everestacademias.com/totem/

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAfdhBWFi3RRPoXtpVKGr2SB47-N76nQVM",
  authDomain: "totem-everest.firebaseapp.com",
  projectId: "totem-everest",
  storageBucket: "totem-everest.firebasestorage.app",
  messagingSenderId: "905492214266",
  appId: "1:905492214266:web:602edba7a94ada89b63443"
};
```
Regras: `allow read, write: if request.auth != null;` → use o SDK +
`signInAnonymously()`. REST puro sem token NÃO funciona.

---

## 1. Coleções atuais

| Coleção | O que é | Mudou? |
|---|---|---|
| `avaliacoes` | avaliações da academia (11 perguntas) | igual, +1 campo (`treino`) |
| `professores` | equipe (nome, cargo, foto) | igual |
| `avaliacoes_professores` | avaliações da equipe (1–5 estrelas) | igual |
| `premios` | **códigos gerados** (quem ganhou) | igual |
| **`premios_config`** | **definições dos prêmios — NOVA** | 🆕 |
| `config` doc `geral` | chaves gerais | simplificou |

DocId = campo `uid` do documento em todas elas. Fotos são data-URL JPEG
(~50 KB) dentro do próprio documento — não usamos Storage.

---

## 2. Sistema de prêmios (o que mais mudou)

### Onde ficam as definições: `premios_config`

```js
{
  uid: "1753460000000-a1b2c3",   // = docId
  nome: "CREATINA 300G",
  desc: "Um pote de creatina monohidratada 300g...",
  foto: "data:image/jpeg;base64,...",   // pode ser ""
  alvo: 200,                    // META: sorteia a cada N avaliações
  regras: "Válido só na academia · Retire em 7 dias",
  repete: true,                 // true = contínuo | false = 1 vez só
  vezes: 3,                     // quantas vezes já saiu
  ativo: true,                  // false = pausado pelo Wilson
  ordem: 2,                     // desempate quando dois batem juntos
  cicloInicio: "2026-07-25T12:00:00.000Z",  // início da contagem ATUAL
  aguardando: false,            // bateu a meta e está na fila (ver abaixo)
  aguardandoDesde: null,
  ultimoCodigo: "EVR-4F8K2M",   // último código que saiu deste prêmio
  ultimoTs: "2026-07-25T18:22:00.000Z",
  ganhou: false,                // só p/ repete=false: travado após ganhador
  codigo: null, ganhouTs: null, // preenchidos quando trava
  sync: true                    // controle interno do tablet — ignore
}
```

### Como calcular o progresso (não existe contador salvo)

```js
progresso = avaliacoes.filter(a => a.ts > premio.cicloInicio).length
falta     = premio.alvo - progresso
```
Cada prêmio conta **em paralelo**, cada um com seu `cicloInicio`.
Quando alguém ganha um prêmio contínuo, o `cicloInicio` dele vira o
instante do sorteio (recomeça do zero) — os outros seguem contando.

**Prêmios que estão contando:** `ativo === true && ganhou !== true && alvo > 0`
**Só conta se a chave geral estiver ligada:** `config/geral.roleta.ativa === true`

### Regra "um prêmio por pessoa" (importante)

Se dois prêmios batem a meta na mesma avaliação, **só um sai**. Os outros
recebem `aguardando: true` e saem para o **próximo avaliador**.
Então, na Central: um prêmio com `aguardando === true` significa
"vai sair na próxima avaliação" (progresso já passou da meta).

### O que é gravado quando alguém ganha: coleção `premios`

```js
{
  uid: "1753461234567-xy98zw",  // = docId
  codigo: "EVR-4F8K2M",         // o que o aluno mostra na recepção
  ts: "2026-07-25T18:22:00.000Z",
  premio: "CREATINA 300G",      // cópia do nome na hora do sorteio
  desc: "...", foto: "data:...", regras: "...",   // cópia fiel
  premioUid: "1753460000000-a1b2c3",  // aponta pro premios_config
  entregue: false,              // ⬅️ AÇÃO: false = aguardando retirada
  sync: true
}
```

---

## 3. Como calcular cada indicador

Escala das notas: `RUIM=1, REGULAR=2, BOM=3, EXCELENTE=4`.
`"NÃO UTILIZO"` = não usa a área (ignore nas médias).

**Categorias (11)** — chaves em `avaliacoes`:
`geral, recepcao, professores, arenakids, quiosque, treino, limpeza,
equipamentos, estrutura, vestiarios, ambiente`

```js
const CATS = ['geral','recepcao','professores','arenakids','quiosque',
              'treino','limpeza','equipamentos','estrutura','vestiarios','ambiente'];
const VAL = {RUIM:1, REGULAR:2, BOM:3, EXCELENTE:4};

// avaliações no total / hoje
const total = avaliacoes.length;
const hoje  = avaliacoes.filter(a => new Date(a.ts).toDateString() === new Date().toDateString()).length;

// ===== REGRA OFICIAL (a mesma do totem) =====
const temNegativo = a => CATS.some(c => a[c]==='RUIM' || a[c]==='REGULAR');
const temPositivo = a => CATS.some(c => a[c]==='BOM'  || a[c]==='EXCELENTE');
const semResposta = a => CATS.some(c => !a[c]);

const eCritica = a => temNegativo(a) || semResposta(a)
                   || typeof a.nps !== 'number' || a.nps <= 5;
const eElogio  = a => temPositivo(a) || (typeof a.nps === 'number' && a.nps >= 6);
// ⚠️ a MESMA avaliação pode contar dos dois lados (ela se divide)

// indicação média (0 a 10) — substituiu o NPS clássico no painel
const notas = avaliacoes.map(a=>a.nps).filter(n=>typeof n==='number');
const indicacaoMedia = notas.length ? (notas.reduce((x,y)=>x+y,0)/notas.length).toFixed(1) : '—';

// % experiência excelente
const pctExcelente = Math.round(avaliacoes.filter(a=>a.geral==='EXCELENTE').length / total * 100);

// média geral (1 a 4)
const vals = avaliacoes.map(a=>VAL[a.geral]).filter(Boolean);
const mediaGeral = (vals.reduce((x,y)=>x+y,0)/vals.length).toFixed(2);

// ⭐ PRÊMIOS A ENTREGAR (a ação mais importante)
const aEntregar = premios.filter(p => p.entregue === false);

// próximo prêmio a sair
const ativos = premios_config.filter(p => p.ativo && !p.ganhou && p.alvo > 0);
const proximo = ativos.map(p => ({
    nome: p.nome,
    falta: p.aguardando ? 0 : Math.max(0, p.alvo - avaliacoes.filter(a=>a.ts > p.cicloInicio).length)
  })).sort((a,b)=>a.falta-b.falta)[0];
// → "faltam 47 avaliações pro próximo prêmio: CREATINA 300G"
// → se falta === 0 e aguardando: "sai na próxima avaliação"
```

**Crítica "lida/vista": NÃO existe no banco.** É só localStorage do
aparelho do Wilson (`everest_visto_criticas`, `everest_visto_elogios`,
`everest_visto_profs`). A Central precisa do **próprio marcador local**:
guarde o timestamp da última visita e conte `a.ts > seuMarcador`.

**Equipe:** em `avaliacoes_professores`, crítica = `estrelas <= 3`,
elogio = `estrelas >= 4`. Ranking é mensal (agrupe por `ts.slice(0,7)`).

**🆕 Horário da avaliação da equipe.** Os documentos novos trazem `faixa`
("19h às 21h") e `turno` ("Manhã" | "Tarde" | "Noite" | "Madrugada").
Como o totem fica **na recepção**, essa é a hora REAL em que o aluno
estava na academia — serve pro dono conferir quem estava trabalhando.
Diferente das avaliações da academia, onde `horario`/`turno` são
**informados pelo aluno** (em que horário ele costuma treinar).

Documentos antigos não têm os campos — derive do `ts`:
```js
const faixaDaHora = ts => { const h = new Date(ts).getHours();
  if(h>=5&&h<8)  return '05h às 08h'; if(h>=8&&h<11) return '08h às 11h';
  if(h>=11&&h<13)return '11h às 13h'; if(h>=13&&h<16)return '13h às 16h';
  if(h>=16&&h<19)return '16h às 19h'; if(h>=19&&h<21)return '19h às 21h';
  if(h>=21&&h<24)return '21h às 23h'; return 'Madrugada'; };
const faixaDe = a => a.faixa || faixaDaHora(a.ts);
```

---

## 4. Exemplos reais (anonimizados)

```js
// avaliacoes/1753459123456-ab12cd
{
  uid:"1753459123456-ab12cd", num:42, ts:"2026-07-25T18:33:17.123Z",
  turno:"Noite", horario:"19h às 21h", area:"MUSCULAÇÃO",
  geral:"BOM", recepcao:"EXCELENTE", professores:"EXCELENTE",
  arenakids:"NÃO UTILIZO", quiosque:"REGULAR", treino:"BOM",
  limpeza:"EXCELENTE", equipamentos:"RUIM", estrutura:"BOM",
  vestiarios:"BOM", ambiente:"BOM", nps:8,
  c_atendimento:"", c_treino:"", c_limpeza:"",
  c_equipamentos:"esteira 3 fazendo barulho", c_estrutura:"",
  c_vestiarios:"", c_ambiente:"", sugestao:"mais anilhas de 10",
  inicio:1753459100000, sync:true
}
// → eCritica: true (equipamentos RUIM) · eElogio: true (tem BOM/EXCELENTE e nps 8)

// premios_config/1753460000000-a1b2c3   (definição)
{ uid:"1753460000000-a1b2c3", nome:"CREATINA 300G",
  desc:"Um pote de creatina monohidratada 300g para turbinar seus treinos",
  foto:"data:image/jpeg;base64,/9j/4AAQ...", alvo:200,
  regras:"Válido só na academia · Retire na recepção em até 7 dias",
  repete:true, vezes:1, ativo:true, ordem:1,
  cicloInicio:"2026-07-25T18:22:00.000Z", aguardando:false, aguardandoDesde:null,
  ultimoCodigo:"EVR-4F8K2M", ultimoTs:"2026-07-25T18:22:00.000Z",
  ganhou:false, codigo:null, ganhouTs:null, sync:true }

// premios/1753461234567-xy98zw   (código ganho — AÇÃO se entregue:false)
{ uid:"1753461234567-xy98zw", codigo:"EVR-4F8K2M",
  ts:"2026-07-25T18:22:00.000Z", premio:"CREATINA 300G",
  desc:"Um pote de creatina monohidratada 300g...", foto:"data:image/jpeg;base64,...",
  regras:"Válido só na academia · Retire na recepção em até 7 dias",
  premioUid:"1753460000000-a1b2c3", entregue:false, sync:true }

// avaliacoes_professores/1753462000000-kk11ll
{ uid:"1753462000000-kk11ll", num:7, ts:"2026-07-25T19:10:00.000Z",
  prof:1753440000000, nome:"Alana - Consultora de vendas",
  faixa:"19h às 21h", turno:"Noite",   // 🆕 hora REAL da avaliação no totem
  estrelas:5, comentario:"Muito atenciosa, me ajudou a escolher o plano", sync:true }

// professores/1753440000000-pp22qq
{ uid:"1753440000000-pp22qq", id:1753440000000,
  nome:"Alana - Consultora de vendas",   // formato "Nome - Cargo" (split em " - ")
  foto:"data:image/jpeg;base64,...", sync:true }

// config/geral   (documento único)
{ prof_ativo: "1",              // "1" = botão AVALIAR EQUIPE visível no totem
  roleta: { ativa: true } }     // chave geral dos prêmios (liga/desliga todos)
```

---

## 5. Sugestão pro cartão da Central

Os 4 sinais que fazem o gestor agir, na ordem:

1. **Prêmios a entregar** — `premios.filter(p=>!p.entregue).length` · vermelho/âmbar,
   é a única ação concreta com flag no banco. Mostrar código + data do mais antigo.
2. **Críticas novas** — desde o marcador local da Central.
3. **Elogios** (verde) e **Equipe** — moral do time.
4. **Saúde:** nota geral (x/4) + indicação média (x/10) + % excelente.
5. **Próximo prêmio:** "faltam 47 avaliações · CREATINA 300G"
   (ou "sai na próxima avaliação" quando `aguardando === true`).

Evite mostrar `vezes`/`ciclo` cru — não diz nada pro gestor.
