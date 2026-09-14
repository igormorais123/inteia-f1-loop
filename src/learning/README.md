# Prática contínua de revisão

Caso inteiramente fictício: setor de atendimento compara formulários em 14 de maio de 2026, com 50 pedidos por versão e medianas de 12 e 9 minutos. Formulário e equipe mudam juntos. O registro não informa data nem autorização para adoção definitiva.

## Contrato pedagógico

1. Preparar: o aluno escreve o próprio critério (até 2.000 caracteres) e confirma que o revisou. O site confere preenchimento, confirmação e a presença de ao menos um elemento conferível no registro (número, data, grupo, mediana, fonte, causa, adoção etc., em `isVerifiableCriterion`); critério vago como "ficar bom" recebe um retorno curto sobre o que falta. Não avalia qualidade nem dá nota. O texto é preservado literalmente e fica somente leitura após registro. O critério-modelo e as três autoconferências ficam num `details` recolhido logo abaixo do campo.
2. Hipótese: escolher entre três previsões completas com mudança, efeito esperado e refutação; envio vazio tem orientação própria. Uma regra de revisão pode retirar diferentes excessos sem trocar os critérios.
3. Executar: a escolha de preservar o original, seguida da ação explícita, guarda `SIMULATION_REQUEST`, cópia da fonte e as quatro frases intactas da candidata em `state.execution`. A interface mostra o pedido antes da ação e expõe as cópias no histórico. É simulação previamente escrita; nenhuma IA foi executada.
4. Avaliar: dados sustentados na frase 2; inferência causal não sustentada na frase 3; data não sustentada por este registro, com frase 4; treinamento não verificado, com fonte `nenhuma` (a ficha de capacitação não foi aberta). Na primeira tentativa, erros recebem perguntas-guia; no acerto ou a partir da segunda tentativa recebem explicações completas. Tentativas não contam como conclusão. Ausência documental não prova falsidade ou uma data alternativa. A correção retira a data até sua confirmação.
5. Corrigir: opções plausíveis preservam alguns elementos, mas podem omitir medianas/grupos ou exceder os limites causais. O retorno identifica exatamente o que não atende aos critérios explícitos do caso, sem fingir avaliar o critério livre do aluno.
6. Encerrar: comunicar observação com limites; declarar inconclusiva a causa ou a data; encaminhar adoção para decisão competente. A saída exige motivo compatível e reconhecimento do limite. A ressalva livre é guardada sem avaliação. Não há aprovação de tarefa real.

## Integração existente

`renderLearningMarkup()` retorna HTML estático. `mountLearning(container,{chapterIndex:0,onNavigate})` retorna `updateChapter(index)`, `getState()` e `destroy()`. Fonte e candidata ficam em details aberto sem JS, sempre em Preparar/Avaliar/Corrigir; nos outros capítulos ficam recolhidas, independentemente da ordem de abertura. Só uma etapa ativa aparece. Navegar não conclui ações. Continuar/Retomar chama o callback síncrono opcional `onNavigate(chapterIndex)` para o integrador atualizar todo o contexto via `openLesson`. Sem callback, atualiza apenas a etapa local. Após callback, foca o h4 e o coloca à vista; `updateChapter` externo nunca move foco.

Carregar `learning.css` depois dos estilos globais. O controlador não abre diálogos. O estado dura enquanto a instância estiver montada: reabrir preserva; recarregar reinicia. O evento `learning-action` informa `{passed,stage,completed}` e jamais certifica o trabalho do aluno. Sem rede, IA ou armazenamento persistente. "Baixar meu registro (.txt)", em "Ações realizadas nesta sessão", gera com `buildRecordText` um texto simples com critério, hipótese, respostas de cada etapa, anotações da tarefa real lidas do caderno (`localStorage`, mesma chave de `main.js`, só leitura) e data. As alternativas de Hipótese, Executar e Corrigir têm comprimentos próximos, e a certa nunca é a mais longa (teste de regressão).

Sem JavaScript, as seis etapas, o pedido exato, a fonte e as opções permanecem no HTML para leitura e resposta em papel. A cópia externa em `noscript` é responsabilidade do renderizador; ele remove o `noscript` interno para não aninhar essas tags. As cópias do registro só aparecem após uma ação com JavaScript.

## Verificação

`node --test tests/learning.test.mjs`: contratos de progressão, texto livre não avaliado, pedido e candidata preservados, distinção epistemológica, correção e motivos de três saídas. O fluxo completo também é exercitado pela máquina de estado. A validação visual do novo build ocorre após integração; testes do módulo não comprovam aparência nem experiência em aparelho real.

## Integração da rodada 2

G1: o exemplo deve distinguir apoio neste registro de confirmação externa, incluir treinamento e usar o pedido literal de `SIMULATION_REQUEST`. G4: o integrador organiza as duas fases do diálogo e os campos da tarefa real; o módulo fornece Critério do caso e documentos recolhíveis. M5: conectar `onNavigate` ao capítulo completo, de forma síncrona, preservando a instância. Não criar outro modal.

Verificação planejada no próximo build imutável: guardar critério e conferir contraste/autoconferência; hipótese vazia e refutação; arquivo errado bloqueia e intacto guarda quatro frases; primeira tentativa errada não revela gabarito, segunda explica; somente não sustentada com frase 4 passa para a data, treinamento só com documento ausente; Continuar/Retomar sincronizam contexto e foco; documentos recolhem ao reabrir, exceto Preparar/Avaliar/Corrigir; noJS preserva todo conteúdo.

## Ajustes da rodada 3

As definições seguem o escopo desta tarefa: **não sustentada** quando o registro trata do assunto, mas não permite a frase; **não verificada** quando não trata do assunto e outro documento precisa ser consultado. Adoção/data pertence ao primeiro caso; treinamento ao segundo. Nenhum rótulo prova falsidade externa.

O critério-modelo aparece antes de guardar o texto livre. Hipótese e Executar apresentam escolhas sem repetir a opção esperada no enunciado ou botão. Em Avaliar, cada achado conferido recolhe em um resumo expansível; os pendentes continuam abertos, e alterar uma resposta remove sua marca de conferência até novo envio. As fontes continuam acessíveis, inclusive sem JavaScript. O espaçamento dos controles foi reduzido, preservando altura mínima de 44 pixels.

Validação desta rodada: suíte npm test na worktree isolada; matriz de 60 combinações de classificação/fonte, fluxo de estado completo e contratos estáticos. Sem build ou inspeção de navegador nesta rodada: a redução de telas, foco e usabilidade móvel precisam ser verificados no próximo build integrado. Conteúdo externo ao módulo permanece sob responsabilidade do integrador; seus exemplos e definições devem usar a mesma classificação única da data.
