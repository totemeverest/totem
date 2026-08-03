# Prêmios do Totem → barra de progresso na Central

> Resposta às 4 perguntas. Estrutura conferida no código em 28/07/2026.

## 1. Onde ficam as DEFINIÇÕES de prêmio

Coleção **`premios_config`** no Firestore do projeto `totem-everest`.
(É a que faltava no seu documento — a `premios` guarda só os códigos
gerados quando alguém ganha.)

DocId = campo `uid`. Um documento por prêmio criado.

| Campo | Tipo | O que é |
|---|---|---|
| `uid` | string | id único, = docId |
| `nome` | string | "CREATINA 300G" |
| `desc` | string | descrição curta (pode ser "") |
| `foto` | string | data-URL JPEG base64 (~50 KB) ou "" |
| `alvo` | number | **a meta**: sorteia a cada N avaliações |
| `regras` | string | texto livre exibido na tela do ganhador |
| `repete` | boolean | **true = recorrente** (recomeça sozinho) · **false = 1 vez só** (trava após o ganhador) |
| `ativo` | boolean | false = pausado pelo Wilson |
| `ordem` | number | só desempate quando dois batem a meta juntos |
| `cicloInicio` | string ISO | **marco em que a contagem atual começou** |
| `vezes` | number | quantas vezes esse prêmio já saiu |
| `aguardando` | boolean | bateu a meta mas está na fila (ver item 2) |
| `aguardandoDesde` | string ISO/null | quando entrou na fila |
| `ultimoCodigo` | string/null | código do último sorteio deste prêmio |
| `ultimoTs` | string ISO/null | data do último sorteio |
| `ganhou` | boolean | só para `repete:false` — true = travado, encerrado |
| `codigo`, `ganhouTs` | string/null | preenchidos quando trava |
| `sync` | boolean | controle interno do tablet — **ignore** |

⚠️ O campo `local` ("vale só na academia") **foi removido** — se aparecer
em documentos antigos, ignore.

**Chave geral:** `config/geral → roleta.ativa` (boolean). Se for `false`,
nenhum prêmio está rodando, mesmo os `ativo:true`.

## 2. Como calcular o progresso

**Não existe contador salvo.** É calculado contando as avaliações
recebidas desde o marco `cicloInicio` daquele prêmio:

```js
const progresso = avaliacoes.filter(a => a.ts > premio.cicloInicio).length;
const falta = Math.max(0, premio.alvo - progresso);
```

- Cada prêmio tem **seu próprio `cicloInicio`** e conta em paralelo.
- Quando um prêmio **recorrente** é ganho, o `cicloInicio` dele vira o
  instante do sorteio → recomeça do zero. Os outros seguem contando.
- `cicloInicio` pode ser `null` num prêmio recém-criado: ele é preenchido
  na primeira vez que o relatório do totem é aberto. Trate `null` como
  "ainda não começou" → progresso 0.

**Prêmios que estão contando agora:**
```js
const rodando = premios_config.filter(p =>
  p.ativo === true && p.ganhou !== true && p.alvo > 0
);
```

**Regra "um prêmio por pessoa"** (importante para a barra não mentir):
se dois prêmios batem a meta na mesma avaliação, só um sai; o outro fica
com `aguardando: true` e sai para o **próximo avaliador**. Então:

```js
const falta = p.aguardando ? 0 : Math.max(0, p.alvo - progresso);
// falta === 0 && p.aguardando  →  "sai na próxima avaliação"
```

**Próximo prêmio a sair** (o que a Central deve destacar):
```js
const proximo = rodando
  .map(p => {
    const prog = p.cicloInicio ? avaliacoes.filter(a=>a.ts > p.cicloInicio).length : 0;
    return { nome:p.nome, foto:p.foto, alvo:p.alvo, prog,
             falta: p.aguardando ? 0 : Math.max(0, p.alvo - prog) };
  })
  .sort((a,b) => a.falta - b.falta)[0];

// → "faltam 47 avaliações pro próximo prêmio: CREATINA 300G"  (barra prog/alvo)
```

## 3. Quando alguém ganha — confirmado, não mudou

Continua gravando na coleção **`premios`**, um documento por código:

```js
{ uid, codigo:"EVR-4F8K2M", ts:"ISO",
  premio:"CREATINA 300G",          // cópia do nome na hora do sorteio
  desc, foto, regras,              // cópia fiel (histórico não muda se editarem depois)
  premioUid:"...",                 // aponta pro premios_config
  entregue:false,                  // ⬅️ AÇÃO: false = aguardando retirada
  sync:true }
```
Única mudança: o campo `local` saiu daqui também.

## 4. Exemplo real de definição (anonimizado)

```js
// premios_config/1753460000000-a1b2c3
{
  "uid": "1753460000000-a1b2c3",
  "nome": "CREATINA 300G",
  "desc": "Um pote de creatina monohidratada 300g para turbinar seus treinos",
  "foto": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
  "alvo": 200,
  "regras": "Válido só na academia, apresentando esta tela · Retire na recepção em até 7 dias · 1 prêmio por aluno",
  "repete": true,
  "vezes": 1,
  "ativo": true,
  "ordem": 1,
  "cicloInicio": "2026-07-25T18:22:00.000Z",
  "aguardando": false,
  "aguardandoDesde": null,
  "ultimoCodigo": "EVR-4F8K2M",
  "ultimoTs": "2026-07-25T18:22:00.000Z",
  "ganhou": false,
  "codigo": null,
  "ganhouTs": null,
  "sync": true
}
```

Exemplo de prêmio de uma vez só, já encerrado:
```js
{ "uid":"1753100000000-zz99yy", "nome":"MÊS GRÁTIS", "alvo":1000,
  "repete":false, "vezes":1, "ativo":true, "ordem":3,
  "cicloInicio":"2026-06-01T08:00:00.000Z",
  "ganhou":true, "codigo":"EVR-9K3M1P", "ganhouTs":"2026-07-20T19:40:00.000Z",
  "aguardando":false, "sync":true }
// ganhou:true → sai da conta do "próximo prêmio"
```

---

### Outras coleções (para o seu documento ficar completo)

`avaliacoes` · `professores` · `avaliacoes_professores` · `premios` ·
`premios_config` · **`auditorias`** (novidade: registra os períodos que o
Wilson já mandou para a IA — `{uid, ts, de:"AAAA-MM-DD", ate10:"AAAA-MM-DD", ate:ISO, qtd}`) ·
`config/geral`.

**Não existe mais** o campo `resolvido` nas avaliações — o marcador de
"crítica resolvida" foi removido do totem a pedido do dono.
