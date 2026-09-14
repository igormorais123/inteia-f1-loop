import { SOURCE, CLAIMS, CORRECTIONS, STAGES, SIMULATION_REQUEST, OPTIONS, createLearningState, checkClaims, applyLearningAction, buildRecordText } from './model.js';
import { FIELDS } from '../content.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const option = (value, text) => `<option value="${value}">${esc(text)}</option>`;
// Opções longas viram botões de opção com texto completo (no celular, a lista suspensa corta o texto); classificação e trecho seguem em lista.
const radios = (name, text, options) => `<fieldset class="lr-corrections"><legend>${text}</legend>${options.map(([v,t])=>`<label class="lr-check lr-version"><input type="radio" name="${name}" value="${v}"><span>${name === 'correction' ? `<strong>Versão ${Number(v)+1}</strong><br>` : ''}${esc(t)}</span></label>`).join('')}</fieldset>`;
const select = (name, text, options) => `<label class="lr-field">${text}<select name="${name}">${option('', 'Escolha uma opção')}${options.map(([v,t])=>option(v,t)).join('')}</select></label>`;
const check = (name, text) => `<label class="lr-check"><input type="checkbox" name="${name}"><span>${text}</span></label>`;
const written = (name, label, hint) => `<label class="lr-field">${label}<textarea name="${name}" rows="3" maxlength="2000" placeholder="${esc(hint)}"></textarea></label>`;
const stage = (i, text, fields, action) => `<section class="lr-step" data-lr-stage="${i}"><h4>${i+1}. ${STAGES[i]}</h4><p>${text}</p>${fields}<button class="lr-action" type="button" data-lr-submit="${i}">${action}</button></section>`;
/** Mesma chave do caderno em src/main.js: o .txt inclui as anotações da tarefa real salvas neste navegador. */
const NOTEBOOK_KEY = 'inteia-f1-loop-notebook-v1';
/** Static content stays readable without JS. Mount adds one active stage at a time. */
export function renderLearningMarkup() {
  return `<section class="lr-lab" data-learning-root aria-label="Prática de revisão com fonte"><h3>O teste melhorou. O comunicado está correto?</h3><p>Você revisa um comunicado interno sobre um formulário de atendimento. Compare a fonte com a candidata, registre os erros e decida o que o texto permite comunicar.</p><details data-lr-documents open><summary>Rever fonte e candidata</summary><div class="lr-docs"><article><h4>Fonte · registro do teste</h4><ol>${SOURCE.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></article><article><h4>Candidata · ainda sem revisão</h4><ol>${CLAIMS.map(c=>`<li>${esc(c.text)}</li>`).join('')}</ol></article></div></details><p class="lr-progress" data-lr-progress>Comece pelo critério do comunicado.</p>
${stage(0,'Escreva com suas palavras o que fará o comunicado estar pronto e o que não pode piorar. Use como referência a data, os grupos, as medianas e a distinção entre observação, causa e autorização.',written('criterion','Critério do caso','Está pronto quando… Não pode piorar…')+'<details class="lr-self-review" data-lr-self-review><summary>Comparar com um critério-modelo</summary><p data-lr-criterion-comparison>Compare o modelo com seu texto antes de guardar.</p><p><strong>Critério-modelo:</strong> Cada afirmação deve ter apoio na fonte; preservar 14 de maio de 2026, os dois grupos de 50 pedidos e as medianas de 12 e 9 minutos, sem atribuir causa ou acrescentar adoção ou treinamento não confirmados.</p>'+check('review-source','Outra pessoa consegue conferir meu critério na fonte?')+check('review-data','Meu critério preserva data, grupos e medianas?')+check('review-cause','Meu critério separa observação de causa e de informação sem confirmação?')+'</details>'+check('self-review','Eu revisei meu critério: outra pessoa consegue conferir o que escrevi na fonte.'),'Guardar meu critério')}
${stage(1,'Qual mudança você testaria no comunicado? Compare a previsão e o resultado que faria abandonar cada hipótese.',radios('hypothesis','Minha hipótese',OPTIONS.hypothesis),'Registrar hipótese')}
${stage(2,'Você recebeu este comunicado e vai começar a revisão. Qual registro permitirá conferir depois o que aconteceu nesta tentativa?',`<h4>Pedido usado</h4><blockquote class="lr-request">${esc(SIMULATION_REQUEST)}</blockquote><p>A resposta é a candidata de quatro frases acima. O pedido é adequado, mas a candidata pode descumpri-lo.</p>${radios('archive-choice','Qual registro você guardará antes de avaliar?', OPTIONS.archiveChoice)}`,'Registrar minha escolha')}
${stage(3,'Sustentada: a fonte apoia a frase. Não sustentada: a fonte trata do assunto, mas não permite afirmar isso. Não verificada: a fonte não trata do assunto e falta consultar outro documento. Ausência de confirmação não prova falsidade.',CLAIMS.map((c,i)=>`<details class="lr-claim" data-lr-claim="${i}" open><summary><span data-lr-summary="${i}">Frase ${i+1}</span><span class="lr-claim-summary-text"> · ${esc(c.text)}</span></summary><p class="lr-claim-original">${esc(c.text)}</p><div class="lr-claim-fields">${select(`verdict-${i}`,'Classificação',OPTIONS.verdict)}${select(`source-${i}`,'Trecho da fonte',[...SOURCE.map((_,j)=>[String(j+1),`Frase ${j+1}`]),['nenhuma','Nenhuma frase do registro trata disso']])}</div><p class="lr-detail" data-lr-finding="${i}"></p></details>`).join(''),'Conferir meus achados')}
${stage(4,'Escolha a correção completa e justifique. Volte à fonte para conferir também o que precisava permanecer igual.',radios('correction','Versão corrigida',CORRECTIONS.map((s,i)=>[String(i),s]))+radios('reason','Por que esta correção atende aos critérios do caso?',OPTIONS.reason),'Conferir correção e motivo')}
${stage(5,'Há mais de uma saída legítima. Indique qual questão você está encerrando e por quê.',radios('decision','Minha decisão',OPTIONS.decision)+radios('decision-reason','Motivo e limite desta decisão',OPTIONS.decisionReason)+written('decision-note','Minha próxima ação ou ressalva (opcional)','O que vou pedir, conferir ou encaminhar?')+check('responsibility','Distingo minha decisão daquilo que esta fonte ainda não permite concluir.'),'Registrar decisão e limite')}
<p class="lr-feedback" data-lr-feedback role="status" aria-live="polite"></p><div class="lr-controls"><button class="lr-action" type="button" data-lr-resume hidden>Voltar à etapa pendente</button><button class="lr-action" type="button" data-lr-next hidden>Continuar exercício</button></div><details class="lr-record" data-lr-record><summary>Ações realizadas nesta sessão</summary><p data-lr-criterion></p><ol data-lr-history><li>Nenhuma ação registrada.</li></ol><details data-lr-archive hidden><summary>Pedido e documentos guardados</summary><p data-lr-request></p><h4>Fonte guardada</h4><ol data-lr-source></ol><h4>Candidata intacta guardada</h4><ol data-lr-candidate></ol></details><p data-lr-corrected></p><p data-lr-decision></p><button class="lr-action lr-download" type="button" data-lr-download>Baixar meu registro (.txt)</button></details><noscript><p>Sem JavaScript, escreva seu critério, copie o pedido e a candidata, compare a fonte e responda às seis etapas em papel.</p></noscript></section>`;
}

/** Anotações da tarefa real salvas pelo caderno; vazio quando o navegador não permite ler. */
function readNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || '{}');
    const notes = FIELDS.filter(([key]) => typeof saved[key] === 'string' && saved[key].trim()).map(([key, label]) => [label, saved[key].trim()]);
    if (typeof saved.decision === 'string' && saved.decision) notes.push(['Minha decisão com base na evidência', [...document.querySelectorAll('#decision option')].find(o => o.value === saved.decision)?.textContent || saved.decision]);
    return notes;
  } catch { return []; }
}

/** Pass the data-learning-root element OR a container that contains it. */
export function mountLearning(container, { chapterIndex = 0, onNavigate } = {}) {
  const root = container.matches('[data-learning-root]') ? container : container.querySelector('[data-learning-root]');
  if (!root) throw new Error('Learning markup is missing');
  if (root.learningController) return root.learningController;
  let state = createLearningState(), current = 0;
  const $ = selector => root.querySelector(selector);
  const feedback = $('[data-lr-feedback]');
  const get = name => (root.querySelector(`input[type="radio"][name="${name}"]:checked`) || root.querySelector(`[name="${name}"]:not([type="radio"])`))?.value || '';
  const checked = name => !!root.querySelector(`[name="${name}"]`)?.checked;
  function draw() {
    root.classList.add('lr-mounted');
    root.querySelectorAll('[data-lr-stage]').forEach(el => { el.hidden = Number(el.dataset.lrStage) !== current; });
    const pending = state.completed.length;
    $('[data-lr-progress]').textContent = pending === 6 ? 'Percurso registrado: fonte, candidata, achados, correção e decisão.' : current === pending ? `Próxima ação: ${STAGES[pending]}.` : `${STAGES[current]} · Próxima ação: ${STAGES[pending]}.`;
    root.querySelectorAll('[data-lr-submit]').forEach(button => { button.disabled = Number(button.dataset.lrSubmit) !== pending; });
    $('[data-lr-resume]').hidden = pending === 6 || current === pending || state.completed.includes(current);
    $('[data-lr-next]').hidden = pending === 6 || !state.completed.includes(current);
    $('[data-lr-history]').innerHTML = state.history.length ? state.history.map(h=>`<li><strong>${esc(h.stage)}:</strong> ${esc(h.action)}</li>`).join('') : '<li>Nenhuma ação registrada.</li>';
    $('[data-lr-corrected]').textContent = state.correctedText ? `Versão que você conferiu: ${state.correctedText}` : '';
    $('[data-lr-criterion]').textContent = state.criterion ? `Seu critério: ${state.criterion}` : '';
    root.querySelector('[name="criterion"]').readOnly = state.completed.includes(0);
    $('[data-lr-self-review]').hidden = false;
    $('[data-lr-criterion-comparison]').textContent = state.criterion ? `Seu critério: ${state.criterion}` : 'Compare o modelo com seu texto antes de guardar.';
    $('[data-lr-next]').textContent = `Ir ao capítulo ${String(pending+1).padStart(2,'0')} · ${STAGES[pending] || 'Encerrar'}`;
    $('[data-lr-archive]').hidden = !state.execution;
    if (state.execution) {
      $('[data-lr-request]').textContent = state.execution.request;
      for (const [key,selector] of [['source','[data-lr-source]'],['candidate','[data-lr-candidate]']]) $(selector).innerHTML = state.execution[key].map(t=>`<li>${esc(t)}</li>`).join('');
    }
    const label = (list,value) => list.find(([v]) => v === value)?.[1] || '';
    $('[data-lr-decision]').textContent = state.decision ? `Decisão: ${label(OPTIONS.decision,state.decision)} Motivo: ${label(OPTIONS.decisionReason,state.decisionReason)} Sua ressalva: ${state.decisionNote || 'Não registrada.'}` : '';
  }
  function updateChapter(index) { current = Math.max(0, Math.min(5, Number.isFinite(index) ? Math.floor(index) : 0)); feedback.textContent = ''; draw(); $('[data-lr-documents]').open = current === 0 || current === 3 || current === 4; }
  function download() {
    const now = new Date(), day = [now.getFullYear(), now.getMonth()+1, now.getDate()].map(n=>String(n).padStart(2,'0')).join('-');
    const url = URL.createObjectURL(new Blob(['﻿' + buildRecordText(state, { now, notes: readNotes() })], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `registro-comunicado-formulario-${day}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function handle(event) {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.matches('[data-lr-download]')) { download(); return; }
    if (button.matches('[data-lr-resume],[data-lr-next]')) {
      updateChapter(state.completed.length);
      if (typeof onNavigate === 'function') onNavigate(current);
      const heading = root.querySelector('.lr-step:not([hidden]) h4');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
      return;
    }
    if (!button.matches('[data-lr-submit]')) return;
    const action = { stage: Number(button.dataset.lrSubmit), criterion:get('criterion'), selfReview:checked('self-review'), hypothesis: get('hypothesis'), archive:Number(button.dataset.lrSubmit)===2, archiveChoice:get('archive-choice'), answers: CLAIMS.map((_,i)=>({verdict:get(`verdict-${i}`),source:get(`source-${i}`)})), choice:get('correction'),reason:get('reason'),decision:get('decision'),decisionReason:get('decision-reason'),decisionNote:get('decision-note'),responsibility:checked('responsibility') };
    if (action.stage === 3 && state.completed.length === 3) checkClaims(action.answers, (state.claimAttempts || 0) + 1).findings.forEach(f=>{
      $(`[data-lr-finding="${f.index}"]`).textContent = f.message;
      const claim = $(`[data-lr-claim="${f.index}"]`);
      claim.dataset.passed = String(f.passed); claim.open = !f.passed;
      $(`[data-lr-summary="${f.index}"]`).textContent = `Frase ${f.index+1}${f.passed ? ' · Conferido' : ' · Rever'}`;
    });
    const result = applyLearningAction(state, action); state = result.state;
    draw(); feedback.textContent = result.message; feedback.dataset.ok = String(result.passed);
    root.dispatchEvent(new CustomEvent('learning-action', { bubbles:true, detail:{passed:result.passed, stage:action.stage, completed:state.completed.length} }));
    if (result.passed) {
      if (state.completed.length === 6) $('[data-lr-record]').open = true;
      const next = $('[data-lr-next]');
      if (!next.hidden) next.focus();
      else { feedback.tabIndex = -1; feedback.focus(); }
    }
  }
  function resetFinding(event) {
    const claim = event.target.closest('[data-lr-claim]');
    if (!claim || state.completed.includes(3)) return;
    const index = Number(claim.dataset.lrClaim);
    delete claim.dataset.passed;
    claim.open = true;
    $(`[data-lr-summary="${index}"]`).textContent = `Frase ${index+1} · Alterada, confira novamente`;
    $(`[data-lr-finding="${index}"]`).textContent = '';
  }
  root.addEventListener('change', resetFinding);
  root.addEventListener('click', handle);
  const controller = { updateChapter, getState:()=>structuredClone(state), destroy(){root.removeEventListener('change',resetFinding);root.removeEventListener('click',handle);delete root.learningController;} };
  root.learningController = controller; updateChapter(chapterIndex); return controller;
}

