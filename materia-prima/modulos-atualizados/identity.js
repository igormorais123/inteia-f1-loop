/** Original INTEIA identity. Outlined letters retain exact spelling at every size. */
export const glyphs=[
 ['I','M0 0H16V64H0Z',false],
 ['N','M32 64V0H48L78 41V0H94V64H78L48 23V64Z',false],
 ['T','M110 0H174V14H150V64H134V14H110Z',false],
 ['E','M190 0H243V14H206V25H237V39H206V50H243V64H190Z',false],
 ['I','M263 0H279V64H263Z',true],
 ['A','M288 64L312 0H338L363 64H344L339 50H311L306 64ZM316 36H334L325 14Z',true]
];
export const emblem='M16 8H36L20 84H0ZM39 84L75 8H96L117 84H95L91 66H68L60 84ZM77 47H87L83 27Z';
export function brandSVG({light=false}={}){
 const ink=light?'#f0f2f3':'#202930',red='#d92135';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 84" role="img" aria-label="INTEIA"><g transform="translate(18 10) skewX(-12)">${glyphs.map(([letter,d,accent])=>`<path data-letter="${letter}" fill="${accent?red:ink}" fill-rule="evenodd" d="${d}"/>`).join('')}</g></svg>`;
}
export function drawBrand(ctx,width,height,{light=false}={}){
 ctx.clearRect(0,0,width,height);const scale=Math.min(width/390,height/84);ctx.save();ctx.translate((width-390*scale)/2,(height-84*scale)/2);ctx.scale(scale,scale);
 const ink=light?'#f0f2f3':'#202930',red='#d92135';
 ctx.translate(18,10);ctx.transform(1,0,-Math.tan(12*Math.PI/180),1,0,0);
 for(const [,d,accent] of glyphs){ctx.fillStyle=accent?red:ink;ctx.fill(new Path2D(d),'evenodd');}
 ctx.restore();
}
