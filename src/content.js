// Fonte de conteúdo da aula. Fatos de F1 reconferidos nas páginas primárias em 14/09/2026:
// Mercedes (simulador; dados), F1/Rob Smedley (correlação, flow-vis, aero rakes, 21/02/2020),
// F1/Hughes e Piola (Ferrari Monza, 05/09/2024) e McLaren (debrief, 19/05/2026).
// Os casos históricos sustentam a lição; o carro animado é uma ilustração.
// Texto visível sem slogans, sem tríades e sem comentários do site sobre si mesmo (pedido do Igor, 14/09/2026).
// `example`: usa o MESMO caso da prática em src/learning/model.js (comunicado interno
// sobre o teste de um formulário de atendimento: medianas de 12 e 9 minutos, 50 pedidos por
// versão, formulário e equipe mudaram juntos, sem data nem autorização de adoção).
// `question`/`choices`/`feedbacks`: quiz opcional, hoje oculto pela integração; são situações
// avulsas de gestão pública, uma explicação por alternativa, na ordem de `choices`.
export const CHAPTERS = [
  {id:'preparar',name:'Preparar',place:'01 / PREPARAR',title:'DEFINA O CRITÉRIO\nANTES DE PEDIR',
   lead:'Decida, antes de pedir, como vai conferir a resposta da IA na fonte.',
   body:'Escolha uma tarefa real e pequena, como um comunicado interno ou a resposta a um ofício. Separe a fonte. Escreva o que conta como pronto de um jeito que outra pessoa consiga conferir na fonte, e o que não pode piorar. Só então peça à IA.',
   action:'Definir meu critério',field:'criterion',extra:['task','reference'],
   prompt:'Complete: “Está pronto quando ___” (algo que outra pessoa confere na fonte) e “Não pode piorar: ___”. Evite palavras como claro, melhor ou profissional.',
   example:'Tarefa: revisar o comunicado interno sobre o teste do novo formulário antes de circular. Fonte: o registro do teste de 14 de maio. Pronto quando: cada frase do comunicado tem apoio numa frase do registro. Não pode piorar: a data, as medianas de 12 e 9 minutos e os grupos de 50 pedidos.',
   lesson:'Na F1, o trabalho antes do evento busca uma configuração de partida sobre a qual os pilotos evoluem nos treinos. Na sua tarefa, a fonte e o critério escrito são esse ponto de partida: sem eles, não há com o que comparar a mudança.',
   source:'https://www.mercedesamgf1.com/news/feature-explaining-the-role-of-an-f1-sim-driver',sourceName:'Mercedes · O trabalho no simulador',
   question:'Você vai pedir à IA um resumo do processo para o despacho da chefia. Qual critério de pronto permite conferir o resultado?',
   choices:['Resumo claro, objetivo e em linguagem formal, em até uma página.','Cada valor, data e fundamento do resumo indica a folha do processo que o sustenta.','O resumo é aprovado por um segundo assistente de IA que o compara com o processo.'],
   correct:1,
   feedback:'Critério de pronto é algo que outra pessoa confere na fonte. Estilo e aprovação de terceiros não mostram fidelidade ao processo.',
   feedbacks:['Uma página é conferível; “claro” e “objetivo” não são. E nada nesse critério impede um valor errado, que é a falha mais cara num despacho.','Qualquer pessoa pode abrir a folha e confirmar ou negar cada fato. O critério diz o que conferir e onde.','Outra IA pode ajudar a revisar, mas isso é um jeito de conferir, não o que conta como pronto. Ela também pode errar ou deixar passar um valor.']},

  {id:'hipotese',name:'Hipótese',place:'02 / HIPÓTESE',title:'TESTE UMA MUDANÇA\nDE CADA VEZ',
   lead:'Antes de testar, escreva o que espera ver e qual resultado mostraria que você errou.',
   body:'Mude uma coisa por vez quando quiser saber o que funcionou. Escreva a previsão antes de conferir: o que deve mudar, por quê e que resultado faria você desistir da ideia.',
   action:'Escrever minha hipótese',field:'hypothesis',
   prompt:'Se eu mudar ___, espero ver ___, porque ___. Desisto da ideia se ___.',
   example:'Se eu retirar do comunicado a causa e a data que o registro não sustenta, mantendo os números, espero que toda frase tenha apoio na fonte. Desisto se a nova versão perder algum dado ou ainda afirmar algo que o registro não diz.',
   lesson:'Correlação, explica Rob Smedley, é comparar o que se mede no carro com o que o simulador previa. Quando os dois não batem, a equipe gasta seu talento de engenharia para entender de onde vem a diferença.',
   source:'https://www.formula1.com/en/latest/article/testing-explained-rob-smedley-on-correlation-aero-rakes-and-flow-vis-paint.5UTaH1q9iuQcXVjZXui3Fz',sourceName:'Formula 1 · Correlação, aero rakes e flow-vis',
   question:'Na segunda versão, você trocou o prompt, anexou o processo completo e usou outro modelo de IA. O resumo melhorou. O que você pode afirmar?',
   choices:['O novo prompt foi decisivo, porque foi a mudança mais trabalhosa.','Anexar o processo completo causou a melhora, porque a IA passou a ter a fonte.','O conjunto melhorou o resultado; para saber o que pesou, é preciso testar uma mudança por vez.'],
   correct:2,
   feedback:'Três mudanças juntas podem melhorar o resultado, mas não mostram qual delas causou a melhora.',
   feedbacks:['O esforço gasto numa mudança não indica o efeito dela. As outras duas mudanças podem explicar a melhora sozinhas.','É uma boa hipótese, mas continua sendo hipótese: o modelo também mudou. Teste só o anexo e compare.','Mudar tudo junto serve para explorar. Para atribuir a causa, compare versões que diferem em uma só coisa.']},

  {id:'executar',name:'Executar',place:'03 / EXECUTAR',title:'GUARDE O PEDIDO\nE A RESPOSTA',
   lead:'Salve a fonte, o pedido e a resposta da IA sem edição antes de mudar qualquer coisa.',
   body:'Dê à IA a fonte, o escopo e o critério. Registre o pedido exato e salve a resposta intacta, com outro nome, ao lado da fonte e da versão anterior. Não corrija enquanto lê: a conferência vem depois, com a resposta guardada.',
   action:'Preparar meu teste',field:'test',extra:['setup'],
   prompt:'Qual pedido vou usar, com qual fonte? Onde fica a resposta intacta? Qual é meu limite de tentativas ou de tempo?',
   example:'Pedido: “Redija um comunicado interno com base somente no registro de 14 de maio de 2026. Preserve a data, os grupos de 50 pedidos e as medianas de 12 e 9 minutos. Separe observação de causa. Não acrescente data ou autorização de adoção definitiva.” Ferramenta: assistente de IA autorizado pelo órgão, com modelo e versão anotados como aparecem no seletor e a data do uso; sem instruções fixas; busca desligada; anexo: só o registro. A resposta ficou salva, sem edição, como “comunicado_candidata”, ao lado do registro. Limite: duas tentativas.',
   lesson:'Na F1, a tinta de flow-vis mostra onde o ar se descola da carroceria, e as aero rakes, conjuntos de tubos de Pitot, medem o escoamento fora dela.',
   source:'https://www.formula1.com/en/latest/article/testing-explained-rob-smedley-on-correlation-aero-rakes-and-flow-vis-paint.5UTaH1q9iuQcXVjZXui3Fz',sourceName:'Formula 1 · Como os testes investigam o carro',
   question:'A IA entregou a nova nota com a frase “todas as informações foram conferidas nos autos”. O que você guarda deste teste?',
   choices:['A nova nota ao lado da anterior, com o pedido usado; a frase da IA não conta como conferência.','A nova nota com a frase da IA, que já registra a conferência feita.','Só a nova nota, no lugar da anterior, para não circularem duas versões.'],
   correct:0,
   feedback:'Guarde a versão anterior, a nova e o pedido. Uma declaração de conferência escrita pela IA não é evidência.',
   feedbacks:['Com as duas versões e o pedido, outra pessoa consegue comparar e repetir o teste. A conferência ainda está por fazer.','A IA pode escrever que conferiu sem ter conferido. A frase é parte do texto a avaliar, não prova de nada.','Evitar confusão é legítimo, mas substituir apaga a base. Se a nova versão tiver erro, você não terá para onde voltar nem com o que comparar.']},

  {id:'avaliar',name:'Avaliar',place:'04 / AVALIAR',title:'CONFIRA CADA FRASE\nNA FONTE',
   lead:'Para cada frase da resposta, procure na fonte o trecho que a sustenta.',
   body:'Leia a resposta frase por frase e procure na fonte o trecho que decide cada uma. Marque sustentada quando a fonte permite a frase, não sustentada quando a fonte trata do assunto e não a permite, e não verificada quando a fonte não trata do assunto. Diga onde conferiu. Um resultado observado ainda não mostra a causa. Outra IA ou um colega ajudam a achar falhas, mas a concordância deles não substitui abrir a fonte.',
   action:'Registrar minha evidência',field:'evidence',
   prompt:'Para cada frase ou critério: sustentada, não sustentada ou não verificada? Qual trecho da fonte decide? O que ficou sem conferir?',
   example:'Frase 1 (medianas de 12 e 9 minutos, 50 pedidos): sustentada pela frase 2 do registro. Frase 2 (o formulário causou a redução): não sustentada; a frase 3 diz que formulário e equipe mudaram juntos. Frase 3 (adoção em 20 de maio): não sustentada; a frase 4 trata da adoção e diz que não há data nem autorização. Frase 4 (a equipe recebeu treinamento): não verificada; nenhuma frase do registro trata de treinamento. Critério: não passou.',
   lesson:'A Mercedes descreve mais de 250 sensores possíveis no carro durante um fim de semana e aponta o desafio de priorizar a informação e revisar os dados certos.',
   source:'https://www.mercedesamgf1.com/news/feature-data-and-electronics-in-f1-explained',sourceName:'Mercedes · Dados e eletrônica na F1',
   question:'Dois colegas e uma IA revisora aprovaram a nota. Nenhum abriu as folhas citadas. Qual é o estado do critério “cada fato com a folha que o sustenta”?',
   choices:['Atende: três revisões independentes chegaram à mesma conclusão.','Não atende: sem conferência, a nota deve ser reprovada.','Não verificado: falta abrir as folhas citadas.'],
   correct:2,
   feedback:'Concordância orienta a revisão, mas não é evidência. Sem abrir a fonte, o critério continua não verificado.',
   feedbacks:['Três leituras que não abriram a fonte podem repetir o mesmo erro. Consenso sem conferência não mostra que o valor está certo.','Faltar conferência não prova que há erro. Reprovar sem evidência é tão infundado quanto aprovar sem evidência.','O estado correto é “não verificado” até alguém abrir as folhas. Registre o que falta conferir e quem vai fazer.']},

  {id:'corrigir',name:'Corrigir',place:'05 / CORRIGIR',title:'CORRIJA SÓ\nO QUE FALHOU',
   lead:'Conserte a falha demonstrada e confira de novo o que já estava certo.',
   body:'Corrija só o que a avaliação demonstrou, com a menor mudança útil. Depois confira de novo esse ponto e tudo o que já estava certo: um texto mais curto ou mais elegante não compensa perder um dado. Mudar um critério exige motivo registrado. Tom profissional ou aprovação de outra IA não são motivo. Se nada falhou, não invente correção.',
   action:'Planejar minha correção',field:'correction',
   prompt:'Qual falha foi demonstrada e em qual trecho da fonte? Qual a menor correção? O que vou conferir de novo, incluindo o que já estava certo?',
   example:'Retirei a causa atribuída ao formulário e a data de 20 de maio, e escrevi que a causa não foi isolada. Mantive a data do teste, as medianas e os grupos de 50 pedidos. Conferi de novo cada frase contra o registro: todas têm apoio.',
   lesson:'O novo assoalho da Ferrari em Monza, em 2024, buscava controlar o quicar do carro introduzido pela atualização de Barcelona. A própria análise da F1 alerta para não tomar correlação por causa: a vitória não prova o efeito da peça.',
   source:'https://www.formula1.com/en/latest/article/tech-weekly-how-ferraris-monza-upgrades-helped-the-team-to-address-a-key.5UpzTp0C4wEAuH8HalwblV',sourceName:'Formula 1 · Ferrari em Monza',
   question:'A versão corrigida ficou mais clara, mas perdeu o prazo de vigência do contrato, que a anterior trazia. O que fazer?',
   choices:['Recolocar o prazo a partir da versão anterior e conferir de novo a clareza e o que já atendia.','Aceitar: a clareza era o objetivo desta volta, e o prazo está nos autos.','Retirar a vigência dos critérios, já que o despacho pode ser feito sem ela.'],
   correct:0,
   feedback:'Uma perda no que já estava certo entra na decisão. Não afrouxe o critério para aceitar a nova versão.',
   feedbacks:['A correção mira a perda, aproveita a base guardada e confere de novo o ganho e o que não podia piorar.','A vigência estava em “não pode piorar”. Aceitar a perda troca uma falha visível por outra escondida no despacho.','Mudar o critério para a versão passar esconde a falha em vez de corrigi-la. Só mude um critério com motivo registrado, e não por causa desta versão.']},

  {id:'encerrar',name:'Encerrar',place:'06 / ENCERRAR',title:'REGISTRE A DECISÃO\nE O QUE FALTA',
   lead:'Escreva o que a evidência permite decidir e o que ainda não permite.',
   body:'Aceite apenas o que foi conferido. Registre “decisão necessária” quando surgir uma consequência fora do combinado, e “inconclusivo” quando faltar prova ou acabar o limite. Anote a decisão, a evidência, o que ficou pendente e a próxima pergunta. Quem retomar não deve refazer o que você já descartou.',
   action:'Concluir meu registro',field:'next',extra:['decision'],
   prompt:'Que decisão a evidência permite, e o que ela não permite? O que ficou pendente? O que a próxima pessoa precisa saber para continuar?',
   example:'Decisão: comunicar só o resultado observado e seus limites. Não autoriza adoção definitiva nem afirma que o formulário causou a redução. Pendente: quem decide a adoção. Próxima volta: comparar os formulários com a mesma equipe, para isolar o efeito. Outra saída válida: encerrar a causa como inconclusiva até esse teste.',
   lesson:'Na McLaren, o debrief entre sessões é estruturado: primeiro as mudanças de acerto que a equipe precisa conhecer, depois os relatos dos engenheiros e as impressões dos pilotos. Daí sai onde colocar o carro na sessão seguinte.',
   source:'https://www.mclaren.com/racing/formula-1/2026/what-do-formula-1-drivers-do-between-sessions/',sourceName:'McLaren · Debrief e preparação da próxima sessão',
   question:'O prazo do despacho acaba hoje e duas afirmações continuam sem folha localizada. Como encerrar?',
   choices:['Enviar a nota como concluída, com a ressalva genérica “sujeito a conferência”.','Registrar inconclusivo para as duas afirmações, informar a lacuna à chefia e anotar o próximo passo.','Rodar o mesmo pedido na IA mais algumas vezes até as folhas aparecerem.'],
   correct:1,
   feedback:'Parar pelo limite é uma decisão válida, mas não equivale a sucesso: o que falta precisa acompanhar o registro.',
   feedbacks:['A ressalva genérica esconde quais afirmações faltam. Quem assina o despacho não sabe o que está sem prova.','A chefia decide sabendo o que foi conferido e o que não foi, e a próxima volta começa da lacuna registrada.','Repetir o mesmo pedido sem mudar nada tende a repetir o resultado e consome o prazo. Se tentar de novo, mude algo e registre a hipótese.']}
];

export const FIELDS = [
 ['task','Minha tarefa real','Ex.: revisar um comunicado ou resumir um processo. Uma tarefa pequena que você já precisa fazer.'],
 ['reference','Fonte e versão de partida','Documento, pasta ou processo de origem, e a versão atual que servirá de comparação.'],
 ['criterion','Critério de pronto e o que não pode piorar','Algo que outra pessoa confere na fonte, e o que precisa continuar certo.'],
 ['hypothesis','Hipótese','Se eu mudar…, espero ver…, porque… Desisto se…'],
 ['setup','Ferramenta, modelo e configuração','Ferramenta autorizada pelo órgão, modelo e versão como aparecem na tela, data, instruções fixas, busca ligada ou desligada e anexos.'],
 ['test','Teste e limite','Pedido usado, onde salvei a resposta intacta e o limite de tentativas ou tempo.'],
 ['evidence','Evidência por frase ou critério','Sustentada, não sustentada ou não verificada, e o trecho da fonte que decide.'],
 ['correction','Correção e reconferência','Falha corrigida, o que mudou e o que conferi de novo.'],
 ['next','Pendência e próxima volta','O que ficou em aberto e o que a próxima pessoa precisa saber.']
];
