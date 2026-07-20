# Totem Everest → Central Everest: guia de integração

Respostas na ordem das perguntas.

## 1. Onde ficam os dados

**Firebase Firestore é a fonte da verdade.** O tablet salva primeiro em
localStorage (pra funcionar offline) e sincroniza em tempo real com o
Firestore (listeners `onSnapshot`). Qualquer aparelho que abra o site
lê tudo da nuvem.

- **Projeto:** `totem-everest` (região southamerica-east1)
- **Config do app Web** (chaves públicas de cliente, pode usar):

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

**Coleções** (docId = campo `uid` do documento):

| Coleção | Conteúdo |
|---|---|
| `avaliacoes` | avaliações da academia (11 perguntas) |
| `professores` | cadastro da equipe (nome, cargo, foto) |
| `avaliacoes_professores` | avaliações individuais da equipe (estrelas 1–5) |
| `premios` | códigos de prêmio gerados pela roleta |
| `config` (doc único `geral`) | configurações: botão equipe ligado + roleta |

Fotos da equipe e do prêmio ficam DENTRO dos documentos, como
data-URL base64 (JPEG ~50 KB). Não usamos Firebase Storage.

## 2. Dá pra ler de fora?

Sim, mas **não sem login**. Regras atuais:

```
allow read, write: if request.auth != null;
```

O provedor **Anônimo** está ativado no projeto. Então a Central só
precisa: inicializar um app secundário com a config acima →
`signInAnonymously()` → ler as coleções. É exatamente como o próprio
totem faz. Não mude as regras pra leitura pública — anônimo já resolve
e mantém fechado pra quem não usa nossos apps.

Atenção: REST sem token NÃO funciona com essas regras — use o SDK
(compat ou modular) com auth anônima.

## 3. Sincronização / aparelhos

- 1 tablet (M10, Fully/Samsung Browser) rodando o totem + o PC do
  Wilson abrindo o mesmo link. Ambos leem/escrevem no mesmo Firestore.
- Avaliação feita offline fica com `sync:false` no localStorage e sobe
  sozinha quando a internet volta. Ao ler o Firestore você já vê tudo
  que foi sincronizado.
- **Backup**: gera JSON `backup_totem_everest_AAAA-MM-DD-HH-MM.json`:

```json
{ "tipo": "backup_totem_everest", "versao": 2, "gerado": "ISO",
  "avaliacoes": [], "professores": [], "avaliacoes_professores": [],
  "premios": [], "roleta": {}, "prof_ativo": "0|1" }
```

## 4. O que exige ação humana (sinais pra Central)

1. **Prêmio aguardando entrega** — o mais importante e o único com
   flag no banco: docs de `premios` com `entregue == false`.
   Wilson confere o código apresentado pelo aluno e marca entregue
   no relatório do totem.
2. **Crítica nova não lida** — NÃO existe flag "lida" no banco. O
   relatório do totem marca "visto" só em localStorage do aparelho do
   Wilson. Pra Central: guarde seu próprio marcador local (timestamp
   da última visita) e conte `avaliacoes` com `ts >` marcador que
   sejam críticas (regra no item 6).
3. **Avaliação de equipe nova** — mesmo esquema: `avaliacoes_professores`
   com `ts >` seu marcador local.
4. Bônus que a Central pode mostrar: **ciclo do prêmio quase batendo**
   — leia `config/geral → roleta`: conte `avaliacoes` com
   `ts > roleta.cicloInicio`; se `roleta.ativa` e a contagem está a
   poucas do `roleta.alvo`, o próximo prêmio está pra sair (bom pra
   equipe se preparar).

## 5. Números que fazem sentido

Os seus 4 são exatamente os certos. Sugestão de cartão:

- Avaliações hoje (e do mês)
- Média da experiência geral (1 a 4) + Indicação média (0 a 10)
- **Prêmios aguardando entrega** (destaque vermelho, é ação)
- Críticas novas desde a última visita
- Extra: progresso do ciclo do prêmio (ex.: "187 de 200")

## 6. Campos, tipos e valores

### `avaliacoes` (1 doc por avaliação)

| Campo | Tipo | Valores |
|---|---|---|
| `uid` | string | id único, = docId |
| `num` | number | sequencial |
| `ts` | string | data ISO 8601 UTC: `"2026-07-18T12:33:17.123Z"` (compare como string ou `new Date(ts)`) |
| `turno` | string | `"Manhã"` \| `"Tarde"` \| `"Noite"` |
| `horario` | string | `"05h às 08h"`, `"08h às 11h"`, `"11h às 13h"`, `"13h às 16h"`, `"16h às 19h"`, `"19h às 21h"`, `"21h às 23h"` |
| `area` | string | `"MUSCULAÇÃO"` \| `"ERGOMETRIA / CARDIO"` \| `"AULAS COLETIVAS"` |
| `geral`, `recepcao`, `professores`, `treino`, `limpeza`, `equipamentos`, `estrutura`, `ambiente` | string | `"RUIM"` \| `"REGULAR"` \| `"BOM"` \| `"EXCELENTE"` |
| `arenakids`, `quiosque`, `vestiarios` | string | os 4 acima **ou** `"NÃO UTILIZO"` |
| `nps` | number | 0 a 10 (exibido como "indicação") |
| `c_atendimento`, `c_treino`, `c_limpeza`, `c_equipamentos`, `c_estrutura`, `c_vestiarios`, `c_ambiente`, `sugestao` | string | texto livre, pode ser `""` |

Média numérica: `RUIM=1, REGULAR=2, BOM=3, EXCELENTE=4`
(ignore `"NÃO UTILIZO"` e ausentes).

**Regra oficial de classificação** (use igual pra bater com o totem):
- **Crítica**: qualquer campo com RUIM/REGULAR, ou `nps <= 5`, ou
  pergunta sem resposta
- **Elogio**: campos BOM/EXCELENTE e `nps >= 6`
- A MESMA avaliação pode contar nos dois lados (ela se divide)

### `avaliacoes_professores`

`uid` (docId), `num` number, `ts` ISO string, `prof` (id do membro,
number — bate com `professores.id`), `nome` string (nome na época),
`estrelas` number 1–5, `comentario` string.
Crítica = estrelas ≤ 3 · Elogio = estrelas ≥ 4. Ranking é mensal
(agrupe por `ts.slice(0,7)`).

### `professores`

`uid` (docId), `id` number, `nome` string no formato `"Nome - Cargo"`
(split em `" - "`), `foto` string dataURL ou null.

### `premios`

`uid` (docId), `codigo` string `"EVR-XXXXXX"`, `ts` ISO string,
`premio` string (nome), `entregue` boolean. **Ação = entregue:false.**

### `config/geral`

`prof_ativo` string `"0"|"1"`; `roleta` objeto: `{ativa:boolean,
nome, desc, regras:string, foto:dataURL, alvo:number,
local:"academia"|"qualquer", cicloInicio:ISO string}`.

## Exemplo real (anonimizado)

```json
// avaliacoes/1752861234567-ab12cd
{
  "uid": "1752861234567-ab12cd", "num": 42,
  "ts": "2026-07-18T12:33:17.123Z",
  "turno": "Noite", "horario": "19h às 21h", "area": "MUSCULAÇÃO",
  "geral": "BOM", "recepcao": "EXCELENTE", "professores": "EXCELENTE",
  "arenakids": "NÃO UTILIZO", "quiosque": "REGULAR", "treino": "BOM",
  "limpeza": "EXCELENTE", "equipamentos": "RUIM", "estrutura": "BOM",
  "vestiarios": "BOM", "ambiente": "BOM",
  "nps": 8,
  "c_atendimento": "", "c_treino": "", "c_limpeza": "",
  "c_equipamentos": "esteira 3 fazendo barulho", "c_estrutura": "",
  "c_vestiarios": "", "c_ambiente": "", "sugestao": "mais anilhas de 10",
  "inicio": 1752861100000, "sync": true
}

// premios/1752861300000-xy98zw
{ "uid": "1752861300000-xy98zw", "codigo": "EVR-4F8K2M",
  "ts": "2026-07-18T12:35:00.000Z", "premio": "UM MÊS GRÁTIS",
  "entregue": false, "sync": true }
```

Com isso dá pra ligar na Central igual à corrida: auth anônima →
`onSnapshot` em `avaliacoes` e `premios` → cartões com "prêmios a
entregar" e "críticas novas" como sinais de ação.
