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
export function monitorMarkup(){return `<section id="analise-no-box" class="monitor-scene" aria-labelledby="monitor-scene-title"><div class="monitor-scene-pin"><div class="monitor-scene-heading"><p>AVALIAR / ANÁLISE NO BOX</p><h2 id="monitor-scene-title">O que o teste permite afirmar?</h2></div><div class="monitor-reading-text"><p>O teste comparou dois formulários, com 50 pedidos por versão: as medianas foram de 12 e 9 minutos.</p><p>O formulário e a equipe mudaram juntos. O teste não isolou a causa da diferença.</p><p>Podemos comunicar a redução observada. Atribuir o ganho ao formulário vai além do que o registro sustenta.</p></div><nav class="monitor-scene-controls" aria-label="Leitura do monitor"><button type="button" data-monitor-prev>← Voltar</button><span id="monitor-page" aria-live="polite">1 / 3 · Observação</span><button type="button" data-monitor-next>Próxima →</button></nav></div></section>`;}
