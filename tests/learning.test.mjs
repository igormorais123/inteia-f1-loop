import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningState, applyLearningAction, checkClaims, checkCorrection, checkDecision, isVerifiableCriterion, buildRecordText, CORRECTIONS, OPTIONS, SIMULATION_REQUEST, CLAIMS, SOURCE } from '../src/learning/model.js';
import { renderLearningMarkup } from '../src/learning/index.js';
const validAnswers = [{verdict:'sustentada',source:'2'},{verdict:'nao-sustentada',source:'3'},{verdict:'nao-sustentada',source:'4'},{verdict:'nao-verificada',source:'nenhuma'}];
test('navigation, skipped stages and incomplete criteria do not produce progress',()=>{
 const s=createLearningState();
 for(const action of [{stage:5,decision:'comunicar',responsibility:true},{stage:0,criterion:'   ',selfReview:true},{stage:0,criterion:'Manter dados',selfReview:false}]){
  const r=applyLearningAction(s,action);assert.equal(r.passed,false);assert.strictEqual(r.state,s);assert.deepEqual(s.history,[]);
 }
});
test('classification requires evidence for each claim, not just correct verdicts',()=>{
 assert.equal(checkClaims(validAnswers).passed,true);
 for(let i=0;i<4;i++){const a=structuredClone(validAnswers);a[i].source='1';assert.equal(checkClaims(a).passed,false);assert.equal(checkClaims(a).findings[i].passed,false);}
 assert.equal(checkClaims([]).passed,false);
});
test('preserving numbers alone does not repair unsupported causality; correction also requires reason',()=>{
 assert.equal(checkCorrection('1','limites').passed,false);
 assert.equal(checkCorrection('0','so-dados').passed,false);
 assert.equal(checkCorrection('0','limites').passed,true);
});
test('complete human action sequence records correction and bounded decision without granting production',()=>{
 let s=createLearningState();
 const actions=[{stage:0,criterion:'Manter datas e dados da fonte.',selfReview:true},{stage:1,hypothesis:'fidelidade'},{stage:2,archive:true,archiveChoice:'intacta'},{stage:3,answers:validAnswers},{stage:4,choice:'0',reason:'limites'}];
 for(const a of actions){const r=applyLearningAction(s,a);assert.equal(r.passed,true);s=r.state;}
 assert.equal(s.correctedText,CORRECTIONS[0]);
 assert.equal(applyLearningAction(s,{stage:5,decision:'producao',responsibility:true}).passed,false);
 assert.equal(s.completed.length,5);
 const result=applyLearningAction(s,{stage:5,decision:'comunicar',decisionReason:'observacao',responsibility:true});assert.equal(result.passed,true);
 assert.equal(result.state.history.length,6);assert.match(result.message,/Não autoriza adoção definitiva/);
 assert.equal(applyLearningAction(result.state,{stage:5,decision:'comunicar',responsibility:true}).passed,false);
});
test('free criterion is preserved literally without claim of semantic approval',()=>{
 const criterion='  Cada frase com apoio na fonte <não avaliado>\nsem mudar as medianas  ';
 const result=applyLearningAction(createLearningState(),{stage:0,criterion,selfReview:true});
 assert.equal(result.passed,true);assert.equal(result.state.criterion,criterion);assert.equal(result.state.criterionReview,'not-assessed');assert.match(result.message,/Critério guardado/);
});
test('Execute archives exact simulation request, source and intact candidate only on explicit save action',()=>{
 let s=createLearningState();s=applyLearningAction(s,{stage:0,criterion:'Conferir cada frase na fonte; nada pode sumir.',selfReview:true}).state;s=applyLearningAction(s,{stage:1,hypothesis:'fidelidade'}).state;
 assert.equal(s.execution,null);assert.equal(applyLearningAction(s,{stage:2,inspect:true}).passed,false);
 s=applyLearningAction(s,{stage:2,archive:true,archiveChoice:'intacta'}).state;assert.equal(s.execution.request,SIMULATION_REQUEST);assert.deepEqual(s.execution.source,SOURCE);assert.deepEqual(s.execution.candidate,CLAIMS.map(c=>c.text));
 assert.notStrictEqual(s.execution.source,SOURCE);assert.equal(s.execution.kind,'prewritten-simulation');
});
test('each claim requires the one classification and source supported by the case',()=>{
 const expected=[['sustentada','2'],['nao-sustentada','3'],['nao-sustentada','4'],['nao-verificada','nenhuma']];
 for(let i=0;i<4;i++) for(const verdict of ['sustentada','nao-sustentada','nao-verificada']) for(const source of ['1','2','3','4','nenhuma']) {
  const answers=structuredClone(validAnswers);answers[i]={verdict,source};
  assert.equal(checkClaims(answers).passed, verdict===expected[i][0]&&source===expected[i][1],`claim ${i+1}: ${verdict}/${source}`);
 }
 assert.match(checkClaims(validAnswers).findings[2].message,/não prova que a data seja falsa/);
});

test('three legitimate outcomes require a coherent scope/reason pair, never a general approval',()=>{
 for(const [decision,reason] of [['comunicar','observacao'],['inconclusivo','causa-pendente'],['inconclusivo','data-pendente'],['decisao-necessaria','autorizacao']]){
  assert.equal(checkDecision(decision,reason,true).passed,true);assert.equal(checkDecision(decision,reason,false).passed,false);
 }
 for(const [decision,reason] of [['comunicar','autorizacao'],['inconclusivo','observacao'],['decisao-necessaria','causa-pendente'],['producao','observacao']]) assert.equal(checkDecision(decision,reason,true).passed,false);
});
test('static markup contains fictional source, candidate and all six stages without global dialog',()=>{
 const html=renderLearningMarkup();assert.doesNotMatch(html,/CASO PARA PRATICAR/);assert.match(html,/12 minutos/);assert.match(html,/20 de maio/);
 assert.equal((html.match(/data-lr-stage=/g)||[]).length,6);assert.doesNotMatch(html,/<dialog|<script/);assert.match(html,/<noscript>/);
});


test('empty hypothesis differs from faulty refutation and archive requires an intact version choice',()=>{
 let s=applyLearningAction(createLearningState(),{stage:0,criterion:'Conferir cada frase na fonte; nada pode sumir.',selfReview:true}).state;
 assert.equal(s.completed.length,1);
 assert.match(applyLearningAction(s,{stage:1}).message,/Escolha uma hipótese/);
 for(const hypothesis of ['so-numeros','opiniao']) assert.equal(applyLearningAction(s,{stage:1,hypothesis}).passed,false);
 s=applyLearningAction(s,{stage:1,hypothesis:'fidelidade'}).state;
 for(const archiveChoice of ['', 'corrigida','sem-fonte']) { const r=applyLearningAction(s,{stage:2,archive:true,archiveChoice});assert.equal(r.passed,false);assert.equal(r.state.execution,null); }
 assert.equal(applyLearningAction(s,{stage:2,archive:true}).passed,false);
});
test('first wrong classification guides without solution; second explains without advancing',()=>{
 let s={...createLearningState(),completed:[0,1,2]};
 const wrong=[{verdict:'nao-verificada',source:'1'},{verdict:'sustentada',source:'1'},{verdict:'sustentada',source:'1'},{verdict:'sustentada',source:'1'}];
 const first=checkClaims(wrong,1);assert.doesNotMatch(first.findings.map(f=>f.message).join(' '),/frase [234]|Não verificada:/);
 let r=applyLearningAction(s,{stage:3,answers:wrong});assert.equal(r.state.claimAttempts,1);assert.equal(r.state.completed.length,3);assert.equal(r.state.history.length,0);
 r=applyLearningAction(r.state,{stage:3,answers:wrong});assert.equal(r.state.claimAttempts,2);assert.equal(r.state.completed.length,3);
 assert.match(checkClaims(wrong,2).findings[1].message,/frase 3/);
 assert.match(checkClaims(validAnswers,1).findings[0].message,/frase 2/);
});

test('training needs missing capacity record; unsupported date and unverified training remain distinct',()=>{
 const answers=structuredClone(validAnswers);answers[2].verdict='nao-sustentada';assert.equal(checkClaims(answers).passed,true);
 answers[3].verdict='nao-sustentada';assert.equal(checkClaims(answers).passed,false);
 assert.equal(CLAIMS.length,4);assert.match(CLAIMS[3].text,/recebeu treinamento/);assert.doesNotMatch(CORRECTIONS[0],/recebeu treinamento/);
 const html=renderLearningMarkup();assert.match(html,/quatro frases/);assert.match(html,/Nenhuma frase do registro trata disso/);assert.match(html,/data-lr-documents open/);assert.match(html,/Critério-modelo/);assert.equal((html.match(/name="review-/g)||[]).length,3);
});

test('static preparation offers the model before save and evaluation keeps four expandable claims',()=>{
 const html=renderLearningMarkup();
 assert.ok(html.indexOf('Critério-modelo:')<html.indexOf('Guardar meu critério'));
 assert.doesNotMatch(html,/dois eixos|ambos os rótulos|aceitamos dois/i);
 assert.match(html,/a fonte trata do assunto, mas não permite afirmar isso/);
 assert.match(html,/a fonte não trata do assunto e falta consultar outro documento/);
 assert.equal((html.match(/data-lr-claim="[0-3]" open/g)||[]).length,4);
 assert.match(html,/>Registrar minha escolha<\/button>/);
});

test('Preparar exige o que conferir e o que não pode piorar, e a recusa diz qual parte falta sem listar palavras',()=>{
 // Casos da tabela do juiz de aprendizagem, rodada 6 (M1), mais o critério-modelo.
 const cases=[
  ['Está pronto quando ficar claro, profissional e fiel à fonte.',false,/Falta dizer o que não pode piorar/],
  ['Está pronto quando o texto estiver claro e sem dados errados.',false,/Falta dizer o que outra pessoa conferiria no registro/],
  ['Pronto quando for objetivo e bem documentado.',false,/Faltam as duas partes/],
  ['Pronto quando o valor do texto for percebido.',false,/Faltam as duas partes/],
  ['Pronto quando a chefia aprovar em 1 dia.',false,/Faltam as duas partes/],
  ['Pronto quando cada afirmação puder ser checada no relatório; nada pode sumir.',true,/Critério guardado/],
  ['Está bom quando o comunicado ficar claro e profissional.',false,/Faltam as duas partes/],
  ['Cada afirmação deve ter apoio na fonte; preservar 14 de maio de 2026, os grupos de 50 pedidos e as medianas de 12 e 9 minutos.',true,/Critério guardado/],
  ['Ficar bom.',false,/Faltam as duas partes/]
 ];
 for(const [criterion,accepted,message] of cases){
  assert.equal(isVerifiableCriterion(criterion),accepted,criterion);
  const r=applyLearningAction(createLearningState(),{stage:0,criterion,selfReview:true});
  assert.equal(r.passed,accepted,criterion);assert.match(r.message,message,criterion);assert.ok(r.message.length<=140);
  if(!accepted){assert.deepEqual(r.state.completed,[]);assert.doesNotMatch(r.message,/data|grupos|medianas|fonte|frase/i,`a recusa não lista palavras aceitas: ${r.message}`);}
 }
 assert.match(applyLearningAction(createLearningState(),{stage:0,criterion:'Cada frase com apoio na fonte; nada pode sumir.',selfReview:false}).message,/Confirme/);
 const html=renderLearningMarkup();assert.match(html,/<details class="lr-self-review" data-lr-self-review><summary>Comparar com um critério-modelo<\/summary>/);
});

test('opções longas aparecem como botões de opção com texto completo, preservando nome e valor',()=>{
 const html=renderLearningMarkup();
 for(const [name,options] of [['hypothesis',OPTIONS.hypothesis],['archive-choice',OPTIONS.archiveChoice],['reason',OPTIONS.reason],['decision',OPTIONS.decision],['decision-reason',OPTIONS.decisionReason]]){
  assert.doesNotMatch(html,new RegExp(`<select name="${name}"`),name);
  for(const [value,text] of options){assert.ok(html.includes(`<input type="radio" name="${name}" value="${value}">`),`${name}=${value}`);assert.ok(html.includes(text.replace(/"/g,'&quot;')),text);}
 }
 assert.equal((html.match(/<select name="verdict-/g)||[]).length,4);
});

test('Encerrar orienta no primeiro erro sem os pares aceitos e só explica na segunda tentativa',()=>{
 const s={...createLearningState(),completed:[0,1,2,3,4]};
 const first=applyLearningAction(s,{stage:5,decision:'inconclusivo',decisionReason:'observacao',responsibility:true});
 assert.equal(first.passed,false);assert.equal(first.state.decisionAttempts,1);
 assert.match(first.message,/\?$/);assert.doesNotMatch(first.message,/inconclusiv|competência|comunicado limitado|teste|documento/i);
 assert.doesNotMatch(applyLearningAction(s,{stage:5,decision:'comunicar',decisionReason:'autorizacao',responsibility:true}).message,/inconclusiv|competência|comunicado limitado/i);
 const second=applyLearningAction(first.state,{stage:5,decision:'inconclusivo',decisionReason:'observacao',responsibility:true});
 assert.equal(second.passed,false);assert.equal(second.state.decisionAttempts,2);assert.match(second.message,/inconclusiva/);assert.match(second.message,/competência/);
 const empty=applyLearningAction(s,{stage:5,decision:'comunicar',responsibility:true});assert.strictEqual(empty.state,s);assert.match(empty.message,/Escolha uma decisão e um motivo/);
 // Nenhum par aceito compartilha palavra de conteúdo (radical de cinco letras) entre decisão e motivo.
 const stems=t=>new Set(t.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>=5).map(w=>w.slice(0,5)));
 const label=(list,v)=>list.find(([k])=>k===v)[1];
 for(const [decision,reason] of [['comunicar','observacao'],['inconclusivo','causa-pendente'],['inconclusivo','data-pendente'],['decisao-necessaria','autorizacao']]){
  const shared=[...stems(label(OPTIONS.decision,decision))].filter(w=>stems(label(OPTIONS.decisionReason,reason)).has(w));
  assert.deepEqual(shared,[],`${decision}/${reason}`);
 }
});

test('distratores usam o vocabulário da aula e não trazem marca pejorativa',()=>{
 const all=[...OPTIONS.hypothesis,...OPTIONS.archiveChoice,...OPTIONS.reason,...OPTIONS.decisionReason].map(([,t])=>t).join(' ');
 assert.doesNotMatch(all,/óbvi|ingênu|preguiç|apressad|descuidad|todas as afirmações/i);
 assert.ok(OPTIONS.hypothesis.filter(([,t])=>/apoio na fonte/.test(t)).length>=2,'"apoio na fonte" não é exclusivo da hipótese certa');
 assert.ok(OPTIONS.archiveChoice.filter(([,t])=>/intacta/.test(t)).length>=2,'"intacta" não é exclusivo do registro certo');
 assert.ok(OPTIONS.reason.filter(([,t])=>/causa|medianas|grupos/.test(t)).length>=2,'o motivo certo não é o único que fala do conteúdo da fonte');
 const starts=OPTIONS.archiveChoice.map(([,t])=>t.split(/[ ,;]/).slice(0,3).join(' '));assert.equal(new Set(starts).size,3,starts.join(' | '));
 assert.equal(checkCorrection('0','data-adocao').passed,false);assert.equal(checkCorrection('0','so-dados').passed,false);
});

test('ferramenta, modelo e configuração têm campo no caderno, pergunta em Executar, linha no .txt e no prompt de revisão',async()=>{
 const {FIELDS,CHAPTERS}=await import('../src/content.js');
 const setup=FIELDS.find(([k])=>k==='setup');assert.ok(setup);assert.match(setup[2],/modelo e versão/);assert.match(setup[2],/data/);
 const exec=CHAPTERS.find(c=>c.id==='executar');assert.deepEqual(exec.extra,['setup']);assert.match(exec.example,/modelo e versão/);
 const blank=buildRecordText(createLearningState(),{now:new Date(2026,8,14,10,32)});assert.match(blank,/Ferramenta, modelo e configuração: em branco\./);
 const filled=buildRecordText(createLearningState(),{now:new Date(2026,8,14,10,32),notes:[['Minha tarefa real','Ofício 12.'],[setup[1],'Assistente do órgão, modelo X versão 2, 14/09/2026, busca desligada.']]});
 assert.match(filled,/Ferramenta, modelo e configuração: Assistente do órgão, modelo X versão 2/);assert.match(filled,/Minha tarefa real: Ofício 12\./);assert.equal((filled.match(/Ferramenta, modelo e configuração/g)||[]).length,1);
 const {readFileSync}=await import('node:fs');assert.match(readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),/Ferramenta, modelo e configuração: \$\{v\('setup'\)\}/);
});

test('option length does not reveal the expected answer in Hipótese, Executar and Corrigir',()=>{
 const groups=[['Hipótese',OPTIONS.hypothesis,'fidelidade'],['Executar',OPTIONS.archiveChoice,'intacta'],['Corrigir · versão',CORRECTIONS.map((t,i)=>[String(i),t]),'0'],['Corrigir · motivo',OPTIONS.reason,'limites']];
 for(const [name,options,correct] of groups){
  const len=Object.fromEntries(options.map(([v,t])=>[v,[...t].length])),values=Object.values(len),max=Math.max(...values),min=Math.min(...values);
  assert.ok(len[correct]<max,`${name}: a opção certa (${len[correct]}) é a mais longa (${max})`);
  assert.ok((max-min)/max<=.12,`${name}: diferença de ${max-min} caracteres entre ${max} e ${min}`);
 }
});

test('record text lists criterion, choices, answers, notes and date in plain language',()=>{
 let s=createLearningState();
 const actions=[{stage:0,criterion:'Cada frase com apoio na fonte; preservar as medianas.',selfReview:true},{stage:1,hypothesis:'fidelidade'},{stage:2,archive:true,archiveChoice:'intacta'},{stage:3,answers:validAnswers},{stage:4,choice:'0',reason:'limites'},{stage:5,decision:'inconclusivo',decisionReason:'causa-pendente',decisionNote:'Pedir teste com a mesma equipe.',responsibility:true}];
 assert.match(buildRecordText(s,{now:new Date(2026,8,14,10,32)}),/1\. Preparar\nAinda não registrado\./);
 for(const a of actions)s=applyLearningAction(s,a).state;
 assert.equal(s.completed.length,6);
 const text=buildRecordText(s,{now:new Date(2026,8,14,10,32),notes:[['Minha tarefa real','Revisar o ofício 12.']]});
 for(const expected of ['Gerado em: 14 de setembro de 2026','Critério: Cada frase com apoio na fonte; preservar as medianas.',OPTIONS.hypothesis[0][1],OPTIONS.archiveChoice[2][1],'Classificação: Não verificada. Trecho da fonte: nenhuma frase do registro trata disso.',CORRECTIONS[0],OPTIONS.reason[0][1],'Decisão: Encerrar como inconclusiva','Próxima ação ou ressalva: Pedir teste com a mesma equipe.','Minha tarefa real: Revisar o ofício 12.']) assert.ok(text.includes(expected),expected);
 assert.doesNotMatch(text,/[{}"]|undefined|Ainda não registrado/);
 assert.match(renderLearningMarkup(),/data-lr-download>Baixar meu registro \(\.txt\)<\/button>/);
});
