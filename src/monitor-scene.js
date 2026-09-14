/** Dedicated reading scene (camera r6): a short arrival, the reading with a drifting shot (story.js monitorShot),
 * and a longer exit so the travel to Corrigir is a pan across ≈900 px instead of a jump. */
export function monitorTimeline(y, top, height) {
 // Section fractions: reading runs ENTER–EXIT. The shot owns the frame (weight≈1) from ≈.17 to ≈.75.
 const ENTER=.18,EXIT=.74;
 const clamp01=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp01(t);return t*t*(3-2*t);};
 const local=clamp01((y-top)/Math.max(1,height));
 const reading=clamp01((local-ENTER)/(EXIT-ENTER));
 // The story and the shot never move the lens at the same time: arrival 0–.12 eases the push-in out onto the
 // monitor (it keeps the scroll's speed where the section starts, so it never parks on the chairs), the shot
 // blends in over the held island pose (.10–.18) and out again (.74–.84); then 3.74→4.00 starts from rest
 // and reaches Corrigir at the scroll rate of the next chapter (cubic −x³+2x², end slope 1).
 const weight=smooth((local-.10)/.08)*(1-smooth((local-EXIT)/.10));
 const a=clamp01(local/.12),x=clamp01((local-.835)/.165);
 const story=local<.12?3.64+.10*(1-(1-a)*(1-a)):local>.835?3.74+.26*(2*x*x-x*x*x):3.74;
 return {local,reading,weight,story,beat:Math.min(2,Math.floor(reading*3)),active:y>=top&&y<top+height,enter:ENTER,exit:EXIT};
}
export function monitorMarkup(){return `<section id="analise-no-box" class="monitor-scene" aria-labelledby="monitor-scene-title"><div class="monitor-scene-pin"><div class="monitor-scene-heading"><p>CONTROLE / PAINEL DO LOOP</p><h2 id="monitor-scene-title">O ganho justifica outra volta?</h2></div><div class="monitor-reading-text"><h3>Frentes em paralelo</h3><p>Exemplo fictício: conteúdo na rodada 2, visual na 1 e funcional na 1; 4 ciclos consumidos no total. O painel acompanha responsável, modelo, estado, tempo, custo e saldo de cada frente.</p><h3>Platô de melhoria</h3><p>Curva ilustrativa, não medição: nas iterações 1 a 7, a qualidade pelo mesmo critério vai de 40 para 62, 78, 86, 89, 90 e 90 pontos. Os ganhos finais são de 1 e 0 ponto, enquanto novas rodadas continuam consumindo recursos. Resultados reais podem oscilar e regredir.</p><h3>Limites da equipe</h3><p>Exemplo de limites: 8 ciclos, 12 minutos ou R$ 20 no total. Pare no primeiro atingido. Some produtores, críticos e ferramentas; ciclos não têm custo fixo. Sem ganho relevante, pause e mude a hipótese. Se o critério não foi atendido, registre a lacuna.</p></div><nav class="monitor-scene-controls" aria-label="Leitura do monitor"><button type="button" data-monitor-prev>← Voltar</button><span id="monitor-page" aria-live="polite">1 / 3 · Frentes</span><button type="button" data-monitor-next>Próxima →</button></nav></div></section>`;}
