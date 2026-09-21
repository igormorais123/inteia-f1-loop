# INTEIA — Engenharia de Loop

## Baixar e reutilizar

Os conteúdos originais de INTEIA / Igor Morais Vasconcelos estão disponíveis sob licença MIT: qualquer pessoa pode usar, copiar, modificar, redistribuir e utilizar comercialmente, preservando o aviso de copyright e a licença. Não é necessário pedir autorização adicional. Esta concessão inclui código, documentação e geometria original, inclusive seus arquivos exportados. Materiais de terceiros conservam suas próprias licenças; o motor V6 já publicado em CC BY 4.0 mantém essa opção de uso. A carroceria derivada do tutorial tem licença de origem não documentada; a MIT cobre as contribuições originais, sem relicenciar a geometria de terceiros.

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

Código e contribuições originais: [MIT](LICENSE). Consulte o [guia de reutilização](REUTILIZACAO.md) para arquivos, exemplos e materiais de terceiros.

## Privacidade

As anotações das atividades ficam no navegador de cada visitante. Para disponibilizar adaptações, use casos fictícios e não inclua dados pessoais ou credenciais nos arquivos publicados.

## Versão de origem

Cópia da versão publicada do site, commit `7d4702f6e93d12860c958bac7343287fad0efc05`. Configurações internas de hospedagem não integram este repositório.
