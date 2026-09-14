/** Exercise fixtures. Entirely fictional; no live F1 or engineering claims. */
import { FIELDS } from '../content.js';
export const SOURCE = [
  'Em 14 de maio de 2026, o setor de atendimento comparou dois formulários.',
  'Na referência, 50 pedidos tiveram mediana de atendimento de 12 minutos. Na candidata, outros 50 pedidos tiveram mediana de 9 minutos.',
  'O formulário e a equipe de atendimento mudaram juntos. O teste não isolou a causa da diferença.',
  'O registro não informa data para adoção definitiva do formulário nem autoriza essa adoção.'
];
export const CLAIMS = [
  { text: 'A mediana passou de 12 minutos para 9 minutos, com 50 pedidos em cada versão.', verdict: 'sustentada', source: '2', explanation: 'A frase 2 sustenta os dois valores e os tamanhos dos grupos. Isso descreve a observação; não demonstra a causa.' },
  { text: 'O novo formulário causou a redução de 3 minutos.', verdict: 'nao-sustentada', source: '3', explanation: 'A frase 3 informa duas mudanças simultâneas. A diferença de 3 minutos existe, mas atribuí-la ao formulário ultrapassa a evidência.' },
  { text: 'O formulário será adotado definitivamente em 20 de maio de 2026.', verdict: 'nao-sustentada', source: '4', explanation: 'A frase 4 trata da adoção e informa que este registro não fornece data nem autorização. Por isso, ele não sustenta a adoção em 20 de maio. Isso não prova que a data seja falsa, mas o comunicado não pode afirmá-la.' },
  { text: 'A equipe da versão candidata recebeu treinamento no novo formulário antes do teste.', verdict: 'nao-verificada', source: 'nenhuma', explanation: 'O registro não fala de treinamento. Decidir exige a ficha de capacitação da equipe, que não foi aberta. Não verificada não quer dizer falsa: retire a frase ou busque o documento.' }
];
export const SIMULATION_REQUEST = 'Redija um comunicado interno com base somente no registro de 14 de maio de 2026. Preserve a data, os grupos de 50 pedidos e as medianas de 12 e 9 minutos. Separe observação de causa. Não acrescente data ou autorização de adoção definitiva.';
// Comprimentos próximos entre as alternativas: o tamanho do texto não indica a resposta (teste de regressão).
export const CORRECTIONS = [
  'Em 14 de maio de 2026, as medianas foram de 12 e 9 minutos, com 50 pedidos por versão. Formulário e equipe mudaram juntos; a causa não foi isolada. Não há data nem autorização de adoção definitiva.',
  'Em 14 de maio de 2026, o novo formulário reduziu a mediana de atendimento de 12 minutos para 9 minutos. A adoção definitiva do novo formulário ainda depende de autorização de quem tem competência.',
  'Em 14 de maio de 2026, o atendimento ficou 3 minutos mais rápido, com 50 pedidos por versão. Como a diferença foi observada, recomenda-se a adoção definitiva do formulário; a data será definida depois.'
];
// Os distratores usam o vocabulário da aula e falham num ponto que só a volta à fonte revela; nenhum traz marca pejorativa.
export const OPTIONS = {
  hypothesis: [['fidelidade','Se eu exigir apoio na fonte em cada afirmação, espero preservar os dados e tirar os excessos. Desisto se restar afirmação sem apoio ou se um dado mudar ou sumir.'],['so-numeros','Se eu exigir apoio na fonte para os números e as datas, espero preservar os dados e tirar os excessos. Desisto se um número, um grupo ou uma data da fonte mudar ou sumir.'],['opiniao','Se eu retirar do comunicado a data de adoção, espero deixar só afirmações com apoio na fonte. Desisto se ainda restar uma data de adoção na versão já revisada.']],
  archiveChoice: [['corrigida','Fonte e pedido exato, com a candidata já ajustada às frases do registro.'],['sem-fonte','Pedido exato e candidata intacta; a fonte fica no processo, onde já está.'],['intacta','Pedido exato, fonte e candidata intacta, separados da futura correção.']],
  verdict: [['sustentada','Sustentada'],['nao-sustentada','Não sustentada'],['nao-verificada','Não verificada']],
  reason: [['limites','Mantém os dados e deixa explícitos os limites de causa e de adoção.'],['data-adocao','Separa observação de causa e mantém a data de adoção que o registro prevê.'],['so-dados','Mantém a data, as medianas e os grupos exatamente como estão na fonte.']],
  decision: [['comunicar','Comunicar somente os resultados observados e seus limites.'],['inconclusivo','Encerrar como inconclusiva a questão indicada no motivo.'],['decisao-necessaria','Encaminhar a adoção para decisão de quem tem competência.']],
  // Motivos sem repetir o verbo ou o substantivo da decisão correspondente: o par não se resolve por palavra igual.
  decisionReason: [['observacao','O registro basta para relatar as duas medianas e os grupos como foram medidos.'],['causa-pendente','Formulário e equipe mudaram juntos, e nenhum teste separou os dois efeitos.'],['data-pendente','Nenhum documento aberto até agora confirma a data de adoção em 20 de maio.'],['autorizacao','O registro não traz o ato de quem pode tornar o novo formulário definitivo.']]
};
export const STAGES = ['Preparar', 'Hipótese', 'Executar', 'Avaliar', 'Corrigir', 'Encerrar'];
export function createLearningState() { return { completed: [], criterion: '', criterionReview: 'not-assessed', claimAttempts: 0, hypothesis: '', archiveChoice: '', execution: null, answers: [], correctionReason: '', correctedText: '', decision: '', decisionReason: '', decisionAttempts: 0, decisionNote: '', history: [] }; }
const plainText = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Duas partes que outra pessoa confere: o que conferir (fonte, registro, frase, afirmação, checar, conferir…) e o que não pode piorar (data, grupos, medianas, números, "nada pode sumir"…). Dígito isolado não conta. Não avalia qualidade. */
export function criterionParts(text = '') {
  const plain = plainText(text);
  const check = /\b(fonte|registr|relat|frase|afirma|trecho|documento|apoi|sustent|respald|chec|confer|verific)/.test(plain);
  const keep = /\b(data|datas|grupo|mediana|numero|minuto|maio|dado|valores|causa|causal|adocao|adotad|autoriz|treinamento|capacitacao)/.test(plain)
    || /\b(nada|nenhum\w*)\b[^.;]*\b(sum|perd|mud|alter|falt|omit)\w*/.test(plain)
    || /\b(sumir|perder|omitir|alterar|mudar)\b[^.;]*\bnada\b/.test(plain);
  return { check, keep };
}
export function isVerifiableCriterion(text = '') { const { check, keep } = criterionParts(text); return check && keep; }
export function checkClaims(answers = [], attempt = 1) {
  const guides = ['Confira separadamente os dois valores e o tamanho de cada grupo.', 'Quantas condições mudaram juntas? O teste separou seus efeitos?', 'Alguma frase do registro trata da adoção? O que ela diz sobre data e autorização?', 'Alguma frase do registro menciona capacitação? Que documento permitiria conferir essa informação?'];
  const findings = CLAIMS.map((claim, i) => {
    const answer = answers[i];
    const passed = answer?.source === claim.source && answer?.verdict === claim.verdict;
    const explanation = claim.explanation;
    return { index: i, passed, message: passed || attempt >= 2 ? explanation : guides[i] };
  });
  return { passed: findings.every(f => f.passed), findings };
}
export function checkCorrection(choice, reason) {
  if (!choice) return { passed: false, message: 'Escolha uma versão para corrigir a candidata.' };
  if (choice !== '0') return { passed: false, message: choice === '1' ? 'A data e as medianas foram preservadas, mas faltam os grupos de 50 pedidos. O formulário ainda recebe uma causa não isolada pelo teste. Corrija os dois pontos.' : 'A diferença e os grupos aparecem, mas as duas medianas desapareceram. Recomendar adoção só pela diferença ignora as mudanças simultâneas e a falta de autorização.' };
  if (reason !== 'limites') return { passed: false, message: !reason ? 'Escolha o motivo da sua correção.' : reason === 'data-adocao' ? 'Volte ao registro: ele não traz data de adoção que possa ser mantida. O motivo precisa corresponder ao que a versão faz com a causa e com a adoção.' : 'Manter os números é necessário, mas a candidata já os trazia. O motivo precisa explicar o que a correção retirou e por que a fonte não sustentava.' };
  return { passed: true, message: 'Você preservou data, medianas e grupos, retirou três afirmações sem apoio: a causa, a data de adoção e o treinamento.' };
}
/** Primeiro erro de par: pergunta ligada ao motivo escolhido, sem os pares aceitos. A partir da segunda tentativa, a explicação completa. */
export function checkDecision(decision, reason, responsibility, attempt = 1) {
  const reasons = { comunicar: ['observacao'], inconclusivo: ['causa-pendente', 'data-pendente'], 'decisao-necessaria': ['autorizacao'] };
  if (!decision || !reason) return { passed: false, mismatch: false, message: 'Escolha uma decisão e um motivo antes de registrar.' };
  if (!reasons[decision]?.includes(reason)) return { passed: false, mismatch: true, message: attempt < 2
    ? (reason === 'observacao' ? 'O motivo escolhido fala do que os dados já permitem. A decisão escolhida trata disso ou de algo que ainda falta?' : 'O motivo escolhido aponta algo que ainda falta. O que resolveria essa falta, e a decisão escolhida leva a isso?')
    : 'Decisão e motivo ainda não correspondem. O que os dados permitem cabe num comunicado limitado. A falta de um teste que separe formulário e equipe, ou de um documento que confirme a data, deixa a questão inconclusiva. A falta do ato de quem pode adotar o formulário leva a decisão a quem tem competência.' };
  if (!responsibility) return { passed: false, message: 'Confirme que você distingue a decisão registrada daquilo que a fonte ainda não permite concluir.' };
  const messages = { comunicar: 'Você escolheu comunicar somente a observação corrigida.', inconclusivo: 'Você encerrou como inconclusiva a questão indicada, preservando os resultados observados.', 'decisao-necessaria': 'Você encaminhou a adoção para decisão competente, sem tratar o teste como autorização.' };
  return { passed: true, message: `${messages[decision]} Não autoriza adoção definitiva.` };
}
export function applyLearningAction(state, action) {
  const index = state.completed.length;
  if (action.stage !== index) return { state, passed: false, message: index === 6 ? 'O percurso desta sessão já foi registrado. Revise o histórico abaixo.' : `Antes desta ação, conclua ${STAGES[index]}. Abrir um capítulo não conclui a atividade.` };
  let message = '', valid = false;
  if (index === 0) { const text = typeof action.criterion === 'string' ? action.criterion : ''; const filled = text.trim().length > 0 && text.length <= 2000, { check, keep } = criterionParts(text), verifiable = filled && check && keep; valid = verifiable && action.selfReview === true; message = valid ? 'Critério guardado como você escreveu.' : !filled ? 'Escreva seu critério e confirme sua própria revisão.' : !check && !keep ? 'Faltam as duas partes: o que outra pessoa conferiria no registro e o que não pode piorar na revisão.' : !check ? 'Falta dizer o que outra pessoa conferiria no registro para saber que o comunicado está pronto.' : !keep ? 'Falta dizer o que não pode piorar: o que precisa continuar igual ao registro depois da revisão.' : 'Confirme sua própria revisão antes de guardar.'; }
  if (index === 1) { valid = action.hypothesis === 'fidelidade'; message = valid ? 'Hipótese registrada: aplicar uma regra de revisão — exigir apoio na fonte para cada afirmação — deve preservar dados e retirar excessos. Será refutada se restar afirmação sem apoio ou se um dado for alterado ou omitido.' : !action.hypothesis ? 'Escolha uma hipótese antes de registrar.' : action.hypothesis === 'so-numeros' ? 'Volte à candidata: nem toda afirmação sem apoio é um número ou uma data. A previsão de tirar os excessos pode falhar sem que essa condição de desistência perceba.' : 'Conferir a ausência da data não basta: outras afirmações podem continuar sem apoio. A previsão precisa poder falhar também nesses pontos.'; }
  if (index === 2) { valid = action.archive === true && action.archiveChoice === 'intacta'; message = valid ? 'Pedido, fonte e resposta candidata guardados sem edição.' : !action.archiveChoice ? 'Escolha o que guardar antes da avaliação.' : action.archiveChoice === 'corrigida' ? 'Ajustar antes de guardar apaga a evidência do que a candidata realmente respondeu. Preserve o original para comparar depois.' : 'Sem a fonte guardada junto, quem conferir depois não sabe qual versão do registro a candidata recebeu. Guarde pedido, fonte e candidata intactos.'; }
  if (index === 3) { const result = checkClaims(action.answers, (state.claimAttempts || 0) + 1); valid = result.passed; message = valid ? 'Quatro achados conferidos: os dados têm apoio; causa e data de adoção não são sustentadas pelo registro; treinamento não foi verificado por falta da ficha de capacitação. Nenhum desses limites prova, por si, falsidade.' : 'Há uma classificação ou referência a rever. Confira o retorno das frases em aberto.'; }
  if (index === 4) { const result = checkCorrection(action.choice, action.reason); valid = result.passed; message = result.message; }
  let decisionMismatch = false;
  if (index === 5) { const result = checkDecision(action.decision, action.decisionReason, action.responsibility, (state.decisionAttempts || 0) + 1); valid = result.passed; message = result.message; decisionMismatch = !!result.mismatch; }
  if (!valid) return { state: index === 3 ? { ...state, claimAttempts: (state.claimAttempts || 0) + 1 } : decisionMismatch ? { ...state, decisionAttempts: (state.decisionAttempts || 0) + 1 } : state, passed: false, message };
  const next = { ...state, completed: [...state.completed, index], history: [...state.history, { stage: STAGES[index], action: message }] };
  if (index === 0) next.criterion = action.criterion;
  if (index === 1) next.hypothesis = action.hypothesis;
  if (index === 2) { next.archiveChoice = action.archiveChoice; next.execution = { request: SIMULATION_REQUEST, source: [...SOURCE], candidate: CLAIMS.map(c=>c.text), kind: 'prewritten-simulation' }; }
  if (index === 3) { next.claimAttempts = (state.claimAttempts || 0) + 1; next.answers = action.answers.map(a => ({ verdict: a.verdict, source: a.source })); }
  if (index === 4) { next.correctedText = CORRECTIONS[0]; next.correctionReason = action.reason; }
  if (index === 5) { next.decision = action.decision; next.decisionReason = action.decisionReason; next.decisionNote = typeof action.decisionNote === 'string' ? action.decisionNote.slice(0,2000) : ''; }
  return { state: next, passed: true, message };
}
const labelOf = (list, value) => list.find(([v]) => v === value)?.[1] || '';
/** Texto simples para o aluno guardar: o que registrou em cada etapa, as anotações da tarefa real e a data. */
export function buildRecordText(state, { now = new Date(), notes = [] } = {}) {
  const done = i => state.completed.includes(i), pending = ['Ainda não registrado.'];
  const lines = ['Registro da prática: comunicado sobre o teste do formulário', `Gerado em: ${now.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`, ''];
  const section = (i, body) => lines.push(`${i + 1}. ${STAGES[i]}`, ...(done(i) ? body() : pending), '');
  section(0, () => [`Critério: ${state.criterion}`]);
  section(1, () => [`Hipótese: ${labelOf(OPTIONS.hypothesis, state.hypothesis)}`]);
  section(2, () => [`Registro guardado: ${labelOf(OPTIONS.archiveChoice, state.archiveChoice)}`, `Pedido: ${state.execution?.request || SIMULATION_REQUEST}`]);
  section(3, () => [`Tentativas até conferir: ${state.claimAttempts}`, ...CLAIMS.flatMap((c, i) => { const a = state.answers?.[i] || {}; return [`Frase ${i + 1}: ${c.text}`, `   Classificação: ${labelOf(OPTIONS.verdict, a.verdict)}. Trecho da fonte: ${a.source === 'nenhuma' ? 'nenhuma frase do registro trata disso' : `frase ${a.source}`}.`]; })]);
  section(4, () => [`Versão escolhida: ${state.correctedText}`, `Motivo: ${labelOf(OPTIONS.reason, state.correctionReason)}`]);
  section(5, () => [`Decisão: ${labelOf(OPTIONS.decision, state.decision)}`, `Motivo: ${labelOf(OPTIONS.decisionReason, state.decisionReason)}`, `Próxima ação ou ressalva: ${state.decisionNote || 'não registrada.'}`]);
  // A configuração da ferramenta sai sempre, mesmo em branco: é o que o capítulo 07 pede para registrar antes de rodar.
  const setupLabel = FIELDS.find(([key]) => key === 'setup')[1], others = notes.filter(([label]) => label !== setupLabel), setup = notes.find(([label]) => label === setupLabel)?.[1];
  lines.push('Anotações na minha tarefa real', `${setupLabel}: ${setup || 'em branco.'}`, ...(others.length ? others.map(([label, value]) => `${label}: ${value}`) : ['Nenhuma outra anotação salva neste navegador.']));
  return lines.join('\n') + '\n';
}
