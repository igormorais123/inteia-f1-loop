# INTEIA — Engenharia de Loop

> **INTEIA fixa na peça:** uso e adaptação dos modelos conforme [ASSET-LICENSE.txt](ASSET-LICENSE.txt). Somente a marca/patrocínio INTEIA deve permanecer; os demais podem ser alterados. Licenças já concedidas às versões anteriores continuam válidas.

## Baixar e reutilizar

Código e documentação: MIT. Para reutilização dos modelos sob os termos atuais, mantenha somente a marca/patrocínio **INTEIA visível e legível na própria peça**; os demais patrocínios podem ser removidos ou trocados. Uso, adaptação, redistribuição e uso comercial continuam permitidos. Consulte a licença de modelos `ASSET-LICENSE.txt` na raiz do repositório. As permissões MIT/CC BY 4.0 já concedidas às versões anteriores permanecem válidas.

[Guia de assets e reutilização](REUTILIZACAO.md) · [Licença MIT](LICENSE) · [Baixar ZIP sem conta](https://github.com/igormorais123/inteia-f1-loop/archive/refs/heads/main.zip)

Aula interativa com carro de fórmula em 3D, monitor de análise no box, exploração do motor e encerramento na pista com créditos de cinema.

**Professor:** Igor Morais Vasconcelos  
**Patrocínio:** INTEIA

## Ver a aula

https://inteia-f1-loop.igor47306.chatgpt.site/

## Executar no computador

Instale Node.js 22 ou superior. Na pasta do projeto:

```sh
npm ci
npm run dev
```

Abra o endereço informado pelo Vite (por padrão, http://127.0.0.1:5198).

## Validar e gerar o site

```sh
npm test
npm run build
```

A pasta `dist/` contém o site estático. O arquivo `index.html` é gerado por `render-page.mjs`; edite o gerador para alterar a estrutura da aula.

## Organização

- `src/content.js` e `src/lecture-points.js`: conteúdo e tópicos da aula.
- `src/learning/`: atividades e registro local.
- `src/narrative.js`: ordem das cenas.
- `src/engine/`: motor e sua aula.
- `src/finale.js`: câmera e chegada na pista.
- `src/scene.js` e `src/world/`: renderização e cenários.
- `public/assets/`: modelos, imagens e informações de procedência.

## Créditos e direitos

IAs creditadas na produção: Fable 5.1 e ChatGPT Astra Ultra. Tecnologias: Three.js, WebGL, JavaScript, Vite e postprocessing.

Código: [MIT](LICENSE). Modelos: [licença com preservação da marca INTEIA](ASSET-LICENSE.txt). Consulte o [guia de reutilização](REUTILIZACAO.md) para arquivos, exemplos e materiais de terceiros.

## Privacidade

As anotações das atividades ficam no navegador de cada visitante. Para disponibilizar adaptações, use casos fictícios e não inclua dados pessoais ou credenciais nos arquivos publicados.

## Versão de origem

Cópia da versão publicada do site, commit `7d4702f6e93d12860c958bac7343287fad0efc05`. Configurações internas de hospedagem não integram este repositório.
