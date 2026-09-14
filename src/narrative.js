import {sampleStory} from './story.js';

// The engine extends the return from the monitor, before Corrigir resumes.
export const CHAPTER_IDS=['preparar','hipotese','executar','avaliar','motor-do-loop','corrigir','encerrar'];
export function narrativePose(progress){
 const p=Math.max(0,Math.min(7,progress));
 const engineChapter=p>=4&&p<5;
 const pose=sampleStory(Math.min(5,p<4?p:p<5?4:p-1));
 return {...pose,engineChapter,engineProgress:engineChapter?p-4:0};
}
