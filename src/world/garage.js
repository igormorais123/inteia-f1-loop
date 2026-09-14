import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {drawBrand} from '../../materia-prima/modulos-atualizados/identity.js';
import {createWipeClip} from '../fx/wipe-clip.js';

// Box INTEIA procedural, derivado do box do laboratório (11 × 15 m).
// Mundo frio e escuro (grafite, gelo apagado, LED frio no teto) com pontos
// quentes de bancada (R10). A geometria estática é fundida por material; só
// ficam separados os grupos cientes da câmera e as telas com CanvasTexture.
// Carro, luz-chave com sombra, névoa e pós pertencem à cena principal.

const DISPLAY = 'Bebas, "Bebas Neue", "Arial Narrow", Impact, sans-serif';
// Barlow, a mesma do corpo da interface: as telas não podem parecer coladas de outro site.
const BODY = 'Barlow, Arial, sans-serif';
const RED = '#D92135';
const DECISIONS = {aceitar: 'Aceitar', reverter: 'Reverter', revisar: 'Revisar', inconclusivo: 'Inconclusivo', 'decisao-necessaria': 'Decisão necessária'};
const FALLBACK_LABELS = {task: 'Tarefa', reference: 'Fonte e versão de referência', criterion: 'Critério', hypothesis: 'Hipótese', test: 'Teste e limite', evidence: 'Evidência observada', correction: 'Correção e regressões', next: 'Pendência e próxima volta', decision: 'Decisão'};
// Ilha de Avaliar: o caso da aula (comunicado sobre o teste do formulário, src/learning/model.js).
// Esquerda: a fonte; centro: dado, limite e conclusão; direita: o registro do aluno ou,
// sem registro, a consequência do critério. Nenhuma tela mostra campo vazio no plano de clímax.
const CASE_SOURCE = [
  'Em 14/05/2026, um setor comparou dois formulários de atendimento.',
  'Referência: 50 pedidos, mediana de 12 min. Candidata: 50 pedidos, 9 min.',
  'Formulário e equipe mudaram juntos. A causa não foi isolada.',
  'Não há data nem autorização para adoção definitiva.',
];
const STUDENT_FIELDS = ['evidence', 'criterion', 'decision'];

export function createGarage({renderer, scene, mobile = false} = {}) {
  const root = new THREE.Group();
  root.name = 'Box INTEIA (procedural)';
  const clip = createWipeClip('garage');
  const materials = new Set();
  const textures = new Set();
  const helper = new THREE.Object3D();
  const maxAniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  let disposed = false;

  // ---------------------------------------------------------------- materiais
  const std = (color, roughness, metalness = 0, env = .55, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
    m.userData.env = env;
    materials.add(m);
    return m;
  };
  const glow = (color, power) => {
    const m = new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(power)});
    m.userData.noShadow = true;
    m.userData.base = m.color.clone();
    materials.add(m);
    return m;
  };
  const grain = makeGrain(mobile ? 128 : 256);
  textures.add(grain);
  grain.repeat.set(7, 8);

  const epoxy = std('#222a2f', .52, 0, .35, {roughnessMap: grain});
  epoxy.userData.noShadow = true;
  const bay = std('#14191c', .55, 0, .3, {roughnessMap: grain});
  bay.userData.noShadow = true;
  // Reflexo analítico no epóxi: o raio refletido é intersectado com os planos
  // das luminárias, da faixa de LED traseira e das telas; o borrão cresce com
  // a distância e a rugosidade, e a silhueta do carro bloqueia o reflexo.
  const floorUniforms = {
    uFloorCam: {value: new THREE.Vector3(5, 1.5, 5)},
    uLedGain: {value: 1}, uScreenGain: {value: 1}, uMonitorGain: {value: 1}, uBand: {value: 0}, uDirectSpec: {value: 1}, uDirectDiffuse: {value: 1},
    uRoofOn: {value: 1}, uRearOn: {value: 1},
  };
  for (const m of [epoxy, bay]) patchFloorReflection(m, floorUniforms, mobile);
  const redPaint = std(RED, .42, .05, .5);
  const plate = std('#22282c', .55, .6, .35);
  const graphite = std('#1d262d', .66, .08, .45);
  const charcoal = std('#12181c', .5, .2, .5);
  const black = std('#090c0f', .5, .15, .5);
  const ice = std('#4a555d', .5, 0, .45);
  const slat = std('#1a2126', .78, 0, .35);
  const steel = std('#a3abb1', .3, 1, 1.0);
  const benchTop = std('#555d63', .3, .85, .9);
  const rubber = std('#131517', .86, 0, .35);
  const ceiling = std('#0c1114', .92, 0, .25);
  const drawer = std('#262e34', .45, .15, .55);
  const ledCool = glow('#e6efff', 3.2);
  const ledAmber = glow('#ffab5e', 6);
  const ledRed = glow('#ff3347', 2.2);
  // Vermelho INTEIA que acende só no debrief (contraluz para a silhueta do carro).
  const stripeRed = std(RED, .42, .05, .5, {emissive: new THREE.Color('#ff2340'), emissiveIntensity: 0});
  const bandRed = std('#1b0b0e', .5, 0, .3, {emissive: new THREE.Color('#ff2340'), emissiveIntensity: 0});
  const ledSlat = glow('#e6efff', 2.4);

  // ------------------------------------------------------ geometria fundida
  const bucketSet = () => ({map: new Map(), add(geo, mat) { if (!this.map.has(mat)) this.map.set(mat, []); this.map.get(mat).push(geo); }});
  const STATIC = bucketSet(), REAR = bucketSet(), SIDE = bucketSet(), ROOF = bucketSet(), ENTRANCE = bucketSet(), FACADE = bucketSet();
  const place = (geo, x, y, z, o = {}) => {
    helper.position.set(x, y, z);
    helper.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    helper.updateMatrix();
    return geo.applyMatrix4(helper.matrix);
  };
  const box = (B, w, h, d, x, y, z, mat, o = {}) => {
    const r = o.r && !mobile ? Math.min(o.r, w * .45, h * .45, d * .45) : 0;
    B.add(place(r ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d), x, y, z, o), mat);
  };
  const cyl = (B, rt, rb, h, x, y, z, mat, o = {}) => B.add(place(new THREE.CylinderGeometry(rt, rb, h, o.seg || (mobile ? 10 : 18)), x, y, z, o), mat);
  const tube = (B, points, r, mat, seg = 24) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    B.add(new THREE.TubeGeometry(curve, mobile ? Math.max(4, seg >> 1) : seg, r, mobile ? 5 : 8, false), mat);
  };
  const detail = !mobile;

  // ---------------------------------------------------------------- piso
  // Epóxi contínuo avançando para o lado aberto (+X/+Z), onde a névoa o engole.
  box(STATIC, 14.6, .1, 15.8, 1.7, -.054, 1.3, epoxy);
  box(STATIC, 3.4, .004, 7.6, 0, -.002, 0, bay);
  for (const x of [-1.77, 1.77]) box(STATIC, .04, .004, 8.24, x, 0, 0, redPaint);
  for (const z of [-4.1, 4.1]) box(STATIC, 3.58, .004, .04, 0, 0, z, redPaint);
  for (const x of [-1.05, 1.05]) for (const z of [-1.65, 1.65]) {
    box(STATIC, .72, .006, .8, x, .001, z, plate);
    if (detail) for (const dx of [-.3, .3]) for (const dz of [-.34, .34]) cyl(STATIC, .012, .012, .004, x + dx, .005, z + dz, black, {seg: 8});
  }
  for (const x of [-3.25, 3.25, 6.5]) box(STATIC, .01, .002, 15, x, -.004, 0, black);
  for (const z of [-4.7, 4.7]) box(STATIC, 14, .002, .01, 1.5, -.004, z, black);

  // ------------------------------------------------------- parede traseira
  // Grafite modular com LED frio lavando o painel técnico; marca como letreiro.
  const RZ = -6.5;
  box(REAR, 11.2, 3.8, .14, 0, 1.9, RZ - .07, graphite);
  for (let x = -4.55; x < 5.5; x += 1.3) box(REAR, .014, 3.6, .02, x, 1.9, RZ + .01, black);
  box(REAR, 11.2, .16, .03, 0, .08, RZ + .015, black);
  box(REAR, 11.2, .045, .02, 0, 2.6, RZ + .012, stripeRed);
  box(REAR, 7.3, 1.36, .05, -.7, 1.76, RZ + .025, charcoal, {r: .012});
  box(REAR, 7.2, .16, .02, -.7, 1.17, RZ + .06, bandRed);
  box(REAR, 7.45, .06, .22, -.7, 2.47, RZ + .11, benchTop, {r: .01});
  box(REAR, 7.2, .014, .05, -.7, 2.433, RZ + .17, ledCool);
  for (const x of [-4.35, 2.95]) box(REAR, .05, .05, .2, x, 2.41, RZ + .1, steel);
  for (const x of [3.75, 5.0]) box(REAR, 1.22, 2.9, .03, x, 1.72, RZ + .02, ice);
  const rearScreenX = [-2.35, -.7, .95];
  for (const x of rearScreenX) box(REAR, 1.56, .9, .05, x, 1.74, RZ + .075, black, {r: .01});

  // ---------------------------------------------------------- parede lateral
  // Painel acústico escuro atrás da ilha (monitores leem sobre fundo escuro);
  // painéis gelo só na frente, fora do plano Avaliar.
  const SX = -5.5;
  box(SIDE, .14, 3.8, 13.3, SX - .07, 1.9, -.1, graphite);
  box(SIDE, .03, .16, 13.3, SX + .015, .08, -.1, black);
  box(SIDE, .02, .045, 13.3, SX + .012, 2.6, -.1, redPaint);
  const slatStep = mobile ? .22 : .11;
  for (let z = -3.9; z <= 1.2; z += slatStep) box(SIDE, .04, 2.3, .06, SX + .03, 1.35, z, slat);
  box(SIDE, .05, .05, 5.25, SX + .03, 2.53, -1.35, charcoal);
  box(SIDE, .012, .012, 5.1, SX + .045, 2.5, -1.35, ledSlat);
  // Eletrocalha da ilha, do piso à laje, presa à parede lateral.
  box(SIDE, .09, 3.75, .09, SX + .25, 1.875, -3.72, charcoal);
  for (const z of [2.15, 3.65, 5.15]) {
    box(SIDE, .03, 2.5, 1.44, SX + .02, 1.5, z, ice);
    box(SIDE, .07, .07, .28, SX + .06, .42, z, charcoal);
    if (detail) box(SIDE, .02, .024, .06, SX + .1, .42, z, steel);
  }

  // ------------------------------------------------------------------ teto
  // Laje escura (tudo que pende tem onde se prender), luminárias lineares frias.
  box(ROOF, 11.4, .1, 13.6, 0, 3.8, -.1, ceiling);
  for (const z of [-4.2, -1.8, .6, 3]) {
    box(ROOF, 4.65, .07, .34, 0, 3.26, z, charcoal, {r: .015});
    box(ROOF, 4.4, .012, .24, 0, 3.222, z, ledCool);
    for (const x of [-2, 2]) cyl(ROOF, .006, .006, .46, x, 3.52, z, steel, {seg: 6});
  }
  for (const x of [-3.35, 3.35]) {
    box(ROOF, .42, .12, 10, x, 3.5, -.45, charcoal, {r: .01});
    if (detail) for (let z = -5; z < 4.6; z += .65) box(ROOF, .46, .02, .025, x, 3.57, z, steel);
    for (const z of [-4, 0, 3]) cyl(ROOF, .01, .01, .2, x, 3.66, z, steel, {seg: 6});
  }
  const coil = [];
  for (let i = 0; i < 150; i++) { const t = i / 149; coil.push([3.3 + Math.sin(t * 46) * .065, 3.46 - t * .9, -4.6 + Math.cos(t * 46) * .065]); }
  tube(ROOF, [[3.3, 3.75, -4.6], ...coil], .011, redPaint, 220);

  // -------------------------------------------------------- portal de entrada
  for (const x of [-5.35, 5.35]) {
    box(ENTRANCE, .22, 3.7, .24, x, 1.85, 5.6, charcoal);
    // Sapata e contato de piso tornam legível onde o montante termina.
    box(ENTRANCE, .7, .006, .72, x, -.001, 5.6, black);
    box(ENTRANCE, .48, .14, .5, x, .067, 5.6, graphite);
  }
  box(ENTRANCE, 10.92, .24, .24, 0, 3.62, 5.6, charcoal);

  // Pátio e fachada oposta contextualizam a tomada por trás do box aberto.
  box(STATIC, 34, .1, 22, 0, -.07, 16, epoxy);
  box(FACADE, 34, 7, .3, 0, 3.5, 9.5, graphite);
  for (const x of [-12, -6, 0, 6, 12]) {
    box(FACADE, 5.4, 4.4, .08, x, 2.3, 9.3, charcoal);
    for (let y = .4; y < 4.5; y += .4) box(FACADE, 5.3, .024, .025, x, y, 9.24, steel);
    box(FACADE, 5.5, .08, .1, x, 5.1, 9.2, ledCool);
    box(FACADE, .12, 6.7, .3, x - 2.85, 3.35, 9.2, steel);
  }
  box(FACADE, 33, .07, .08, 0, 5.8, 9.25, stripeRed);
  // ------------------------------------------------ armários e bancada traseira
  function cabinet(B, x, z, w = 1.35, facing = 1) {
    box(B, w, .95, .72, x, .53, z, graphite, {r: .014});
    box(B, w + .05, .065, .78, x, 1.035, z, benchTop, {r: .01});
    const front = z + facing * .375;
    for (let i = 0; i < 5; i++) {
      box(B, w - .06, .135, .025, x, .21 + i * .16, front, drawer, {r: .006});
      box(B, w - .2, .018, .022, x, .255 + i * .16, front + facing * .02, steel);
    }
    for (const dx of [-w * .38, w * .38]) for (const dz of [-.25, .25]) cyl(B, .026, .026, .1, x + dx, .05, z + dz, black, {seg: 8});
  }
  for (const x of [-3.5, -2.08, -.66, .76, 2.18]) cabinet(STATIC, x, -5.77);
  // Armário alto de peças, no canto.
  box(STATIC, .92, 2.25, .72, -4.72, 1.13, -5.77, graphite, {r: .014});
  for (const x of [-4.945, -4.495]) {
    box(STATIC, .43, 2.1, .03, x, 1.15, -5.395, drawer, {r: .006});
    box(STATIC, .025, .3, .035, x + (x < -4.7 ? .15 : -.15), 1.2, -5.37, steel);
    if (detail) for (let i = 0; i < 6; i++) box(STATIC, .28, .012, .006, x, .3 + i * .034, -5.378, black);
  }

  // Luminária de trabalho âmbar sobre a bancada (ponto quente do plano de abertura).
  const LAMP = {x: -3.62, z: -5.95};
  cyl(STATIC, .11, .12, .03, LAMP.x, 1.083, LAMP.z, black);
  tube(STATIC, [[LAMP.x, 1.09, LAMP.z], [LAMP.x + .02, 1.45, LAMP.z - .02], [LAMP.x + .12, 1.72, LAMP.z + .12]], .012, charcoal, 12);
  tube(STATIC, [[LAMP.x + .12, 1.72, LAMP.z + .12], [LAMP.x + .3, 1.66, LAMP.z + .32]], .012, charcoal, 6);
  cyl(STATIC, .045, .11, .16, LAMP.x + .33, 1.6, LAMP.z + .36, black, {rx: .55, seg: 16});
  cyl(STATIC, .085, .085, .006, LAMP.x + .35, 1.54, LAMP.z + .4, ledAmber, {rx: .55, seg: 16});

  // ----------------------------------------------------- ilha de engenharia
  const IX = -4.45;
  const MON_Z = [-2.7, -1.35, 0];
  const MON = {w: 1.14, h: .64, x: -4.72, y: 1.52};
  box(STATIC, .9, .05, 4.5, IX, .755, -1.4, charcoal, {r: .01});
  box(STATIC, .9, .012, 4.5, IX, .786, -1.4, benchTop);
  for (const z of [-3.5, .7]) box(STATIC, .72, .73, .05, IX, .365, z, graphite);
  box(STATIC, .03, .42, 4.1, IX - .38, .5, -1.4, graphite);
  // Trilho de monitores apoiado em dois postes presos ao tampo.
  for (const z of [-3.42, .62]) { cyl(STATIC, .028, .028, .96, -4.86, 1.27, z, steel); box(STATIC, .16, .02, .16, -4.86, .8, z, black); }
  // Trilho fino: no plano da tela ele atravessava o quadro como uma barra preta.
  box(STATIC, .035, .04, 4.12, -4.86, 1.62, -1.4, steel, {r: .008});
  for (const z of MON_Z) {
    box(STATIC, .045, MON.h + .05, MON.w + .05, MON.x - .02, MON.y, z, black, {r: .01});
    box(STATIC, .1, .08, .08, -4.8, 1.6, z, charcoal);
    box(STATIC, .18, .02, .46, -4.08, .8, z, black, {r: .006});
    if (detail) for (let row = 0; row < 4; row++) for (let col = 0; col < 12; col++) box(STATIC, .026, .006, .028, -4.14 + row * .038, .812, z - .205 + col * .037, charcoal);
    box(STATIC, .2, .004, .22, -4.08, .794, z + .42, rubber);
    box(STATIC, .06, .03, .1, -4.08, .81, z + .42, charcoal, {r: .012});
  }
  // Cadeiras recuadas, entre os monitores e abaixo da linha de visão do plano Avaliar.
  for (const z of [-2.02, -.62]) {
    const cx = -3.72;
    box(STATIC, .46, .08, .46, cx, .5, z, charcoal, {r: .02});
    box(STATIC, .07, .46, .44, cx + .27, .8, z, charcoal, {r: .02, rz: -.12});
    cyl(STATIC, .03, .04, .38, cx, .27, z, steel);
    for (const dz of [-.27, .27]) box(STATIC, .26, .035, .05, cx + .02, .66, z + dz, black, {r: .01});
    for (let a = 0; a < 5; a++) {
      const angle = a * Math.PI * 2 / 5 + .3, px = cx + Math.cos(angle) * .26, pz = z + Math.sin(angle) * .26;
      box(STATIC, .27, .025, .04, cx + Math.cos(angle) * .13, .09, z + Math.sin(angle) * .13, steel, {ry: -angle});
      cyl(STATIC, .035, .035, .04, px, .04, pz, rubber, {rz: Math.PI / 2, ry: -angle, order: 'YXZ', seg: 10});
    }
  }
  // Luminária de mesa âmbar na ponta da ilha.
  const DESK_LAMP = {x: -4.62, z: -3.55};
  cyl(STATIC, .07, .08, .025, DESK_LAMP.x, .805, DESK_LAMP.z, black);
  tube(STATIC, [[DESK_LAMP.x, .81, DESK_LAMP.z], [DESK_LAMP.x + .05, 1.18, DESK_LAMP.z + .02], [DESK_LAMP.x + .3, 1.3, DESK_LAMP.z + .12]], .01, charcoal, 12);
  cyl(STATIC, .035, .075, .11, DESK_LAMP.x + .34, 1.26, DESK_LAMP.z + .13, black, {rz: -.5, seg: 14});
  cyl(STATIC, .06, .06, .006, DESK_LAMP.x + .37, 1.21, DESK_LAMP.z + .14, ledAmber, {rz: -.5, seg: 14});

  // ------------------------------------------------------ carrinho de ferramentas
  const TX = 2.75, TZ = -3.85;
  cabinet(STATIC, TX, TZ, 1.05, 1);
  for (const x of [TX - .43, TX + .43]) for (const z of [TZ - .27, TZ + .27]) { cyl(STATIC, .065, .065, .045, x, .065, z, rubber, {rz: Math.PI / 2, seg: 12}); box(STATIC, .025, .09, .1, x, .13, z, steel); }
  tube(STATIC, [[TX - .48, .72, TZ - .36], [TX - .48, 1.14, TZ - .36], [TX + .48, 1.14, TZ - .36], [TX + .48, .72, TZ - .36]], .016, steel, 16);
  box(STATIC, .83, .012, .35, TX, 1.074, TZ + .03, rubber);
  if (detail) for (let i = 0; i < 5; i++) { const x = TX - .28 + i * .14; cyl(STATIC, .022, .022, .038, x, 1.09, TZ - .22, steel, {seg: 10}); }
  cyl(STATIC, .052, .048, .23, TX + .05, 1.13, TZ + .05, charcoal, {rz: Math.PI / 2});
  box(STATIC, .05, .13, .07, TX + .05, 1.09, TZ + .05, redPaint, {r: .01});
  tube(STATIC, [[TX + .05, 1.03, TZ + .05], [TX + .35, .45, TZ + .3], [TX + .6, .03, TZ + .2], [TX + .9, .03, TZ + .8], [TX + .5, .03, TZ + 1.3]], .012, black, 32);

  // ------------------------------------------------------ prateleira de pneus
  const RX = 4.45, RKZ = -5.0;
  for (const x of [RX - .52, RX + .52]) for (const z of [RKZ - .53, RKZ + .53]) box(STATIC, .035, 2.35, .035, x, 1.175, z, steel);
  const tireSeg = mobile ? 24 : 40;
  const profile = [[.19, -.13], [.29, -.17], [.335, -.15], [.35, -.1], [.35, .1], [.335, .15], [.29, .17], [.19, .13], [.19, -.13]].map(p => new THREE.Vector2(...p));
  for (const y of [.16, 1.22]) {
    box(STATIC, 1.16, .035, 1.18, RX, y, RKZ, steel);
    for (const dz of [-.29, .29]) {
      STATIC.add(place(new THREE.LatheGeometry(profile, tireSeg), RX, y + .37, RKZ + dz, {rx: Math.PI / 2}), rubber);
      STATIC.add(place(new THREE.TorusGeometry(.19, .014, 6, tireSeg), RX, y + .37, RKZ + dz + .075), steel);
      if (detail) STATIC.add(place(new THREE.TorusGeometry(.3, .006, 4, tireSeg), RX, y + .37, RKZ + dz + .16), ledRed);
    }
  }
  tube(STATIC, [[RX - .54, .18, RKZ - .54], [RX + .54, 2.3, RKZ - .54]], .012, steel, 4);
  tube(STATIC, [[RX + .54, .18, RKZ - .54], [RX - .54, 2.3, RKZ - .54]], .012, steel, 4);

  // --------------------------------------------------------------- macaco
  // Encostado perto da parede lateral, fora da linha das câmeras em +X.
  const JX = -4.7, JZ = 2.9;
  box(STATIC, .54, .1, .55, JX, .12, JZ, charcoal, {r: .02});
  for (const z of [JZ - .29, JZ + .29]) cyl(STATIC, .09, .09, .06, JX, .1, z, rubber, {rx: Math.PI / 2, seg: 14});
  box(STATIC, .12, .055, .38, JX + .23, .24, JZ, steel, {r: .01});
  box(STATIC, .1, .045, .22, JX + .27, .285, JZ, rubber, {r: .01});
  tube(STATIC, [[JX - .2, .16, JZ], [JX - .42, .42, JZ], [JX - .72, 1.12, JZ]], .024, steel, 8);
  box(STATIC, .09, .045, .38, JX - .72, 1.14, JZ, redPaint, {r: .01});

  // ------------------------------------------------------------ montagem
  const statics = new THREE.Group(); statics.name = 'Box · estático';
  const rearWall = new THREE.Group(); rearWall.name = 'Box · parede traseira';
  const sideWall = new THREE.Group(); sideWall.name = 'Box · parede lateral';
  const roof = new THREE.Group(); roof.name = 'Box · teto';
  const entrance = new THREE.Group(); entrance.name = 'Box · portal';
  const facade = new THREE.Group(); facade.name = 'Box · fachada do pátio';
  root.add(statics, rearWall, sideWall, roof, entrance, facade);
  build(STATIC, statics, true);
  build(REAR, rearWall, false);
  build(SIDE, sideWall, false);
  build(ROOF, roof, false);
  build(ENTRANCE, entrance, true);
  build(FACADE, facade, true);

  function build(B, group, cast) {
    for (const [mat, list] of B.map) {
      const indexed = list.every(g => g.index);
      const prepared = list.map(g => {
        for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
        g.clearGroups();
        return indexed || !g.index ? g : g.toNonIndexed();
      });
      const merged = mergeGeometries(prepared, false);
      for (const g of new Set([...list, ...prepared])) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${group.name} · ${mat.type}`;
      mesh.castShadow = cast && !mat.userData.noShadow;
      mesh.receiveShadow = !mat.isMeshBasicMaterial;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }

  // ----------------------------------------------------------------- telas
  const screenGain = 1.5;
  function makeScreen(parent, w, h, x, y, z, ry, cw, ch, gain = screenGain) {
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAniso;
    textures.add(texture);
    const material = new THREE.MeshBasicMaterial({map: texture, color: new THREE.Color(gain, gain, gain)});
    material.userData.base = material.color.clone();
    materials.add(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    parent.add(mesh);
    return {canvas, ctx: canvas.getContext('2d'), texture, material, mesh};
  }
  // O monitor central é lido em close (35–40% da largura): textura maior que a das laterais.
  // Emissivo moderado: texto claro acima do limiar do bloom vira halo e perde a leitura.
  const notebookGain = 1.05;
  const notebookScreens = [...MON_Z].reverse().map((z, i) => {
    const [cw, ch] = i === 1 ? (mobile ? [1024, 576] : [1536, 864]) : (mobile ? [768, 432] : [1024, 576]);
    return makeScreen(statics, MON.w, MON.h, MON.x + .004, MON.y, z, Math.PI / 2, cw, ch, notebookGain);
  });
  const rearScreens = rearScreenX.map(x => makeScreen(rearWall, 1.5, .84, x, 1.74, RZ + .102, 0, mobile ? 512 : 1024, mobile ? 288 : 576));

  const brandCanvas = document.createElement('canvas');
  [brandCanvas.width, brandCanvas.height] = mobile ? [1024, 200] : [2048, 400];
  const brandTexture = new THREE.CanvasTexture(brandCanvas);
  brandTexture.colorSpace = THREE.SRGBColorSpace;
  brandTexture.anisotropy = maxAniso;
  textures.add(brandTexture);
  const brandMaterial = new THREE.MeshBasicMaterial({map: brandTexture, transparent: true, depthWrite: false, color: new THREE.Color(.95, .95, .95)});
  materials.add(brandMaterial);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5 * brandCanvas.height / brandCanvas.width), brandMaterial);
  brand.name = 'INTEIA · marca';
  brand.position.set(-2.2, 3.02, RZ + .03);
  rearWall.add(brand);

  // ------------------------------------------------------------------ luzes
  // Sem sombra: a luz-chave com sombra é da cena principal.
  const lights = new THREE.Group(); lights.name = 'Box · luzes práticas';
  root.add(lights);
  const overhead = new THREE.SpotLight('#cddbeb', 34, 9, .9, 1, 2);
  overhead.position.set(0, 3.2, .2); overhead.target.position.set(0, 0, -.2);
  const benchLamp = new THREE.SpotLight('#ff9a48', 24, 4.5, .95, .85, 2);
  benchLamp.position.set(LAMP.x + .35, 1.53, LAMP.z + .42); benchLamp.target.position.set(LAMP.x + .7, 1.0, LAMP.z - .3);
  // Luz de fundo dos monitores: lava o painel acústico em azul e recorta as telas.
  const monitorGlow = new THREE.PointLight('#4f8ff0', 5, 3.4, 2);
  monitorGlow.position.set(-5.08, 1.5, -1.35);
  lights.add(overhead, overhead.target, benchLamp, benchLamp.target, monitorGlow);
  let deskLamp = null;
  if (!mobile) {
    deskLamp = new THREE.PointLight('#ff9848', 2.2, 2.4, 2);
    deskLamp.position.set(DESK_LAMP.x + .37, 1.17, DESK_LAMP.z + .14);
    lights.add(deskLamp);
  }
  // Luzes de humor: começam apagadas e só sobem com evaluate/debrief (contagem fixa, sem recompilar shaders).
  const monitorWash = new THREE.SpotLight('#6fa4ff', 0, 6, 1.15, 1, 2);
  monitorWash.position.set(-4.55, 1.5, -1.35); monitorWash.target.position.set(-2.8, 0, -1.35);
  const redWash = new THREE.PointLight('#ff2a40', 0, 6.5, 2);
  redWash.position.set(0, .75, -5.0);
  lights.add(monitorWash, monitorWash.target, redWash);
  // Leitura no monitor: a tela derrama luz fria na mesa e um lavador rasante dá à parede de ripas
  // uma poça de luz com queda, em vez de cortina azul uniforme.
  const screenSpill = new THREE.SpotLight('#8fb4ff', 0, 2.6, .95, 1, 2);
  screenSpill.position.set(-4.62, 1.22, -1.35); screenSpill.target.position.set(-3.95, .78, -1.35);
  const wallGrazer = new THREE.SpotLight('#d6e4ff', 0, 3.6, .85, 1, 2);
  wallGrazer.position.set(-5.22, 2.75, -1.1); wallGrazer.target.position.set(-5.47, .7, -1.5);
  lights.add(screenSpill, screenSpill.target, wallGrazer, wallGrazer.target);
  const lightBase = new Map([overhead, benchLamp, monitorGlow, deskLamp].filter(Boolean).map(l => [l, l.intensity]));

  // --------------------------------------------------------- cena de ambiente
  const envScene = buildEnvScene();
  let envTarget = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTarget = pmrem.fromScene(envScene, .025, .1, 60);
    pmrem.dispose();
  }
  envScene.userData.carOnly.visible = true;
  for (const m of materials) {
    if (m.isMeshStandardMaterial) { m.envMap = envTarget?.texture || null; m.envMapIntensity = m.userData.env; }
    clip.patch(m);
  }
  // Vidro das telas da ilha: reflexo sutil do box somado à imagem, fraco o bastante para não
  // competir com o texto.
  // No plano frontal o reflexo do ambiente é escuro; um brilho diagonal largo e a luz do teto
  // no alto da tela dizem "vidro" sem cobrir o texto.
  for (const screen of notebookScreens) {
    const material = screen.material, previous = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
    material.envMap = envTarget?.texture || null;
    material.combine = THREE.AddOperation;
    material.reflectivity = .12;
    material.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 q = vMapUv;
  float band = 1. - smoothstep(0., .24, abs(q.x * .6 + q.y - 1.08));
  float top = smoothstep(.72, 1., q.y);
  diffuseColor.rgb += vec3(.62, .72, .86) * (.05 * band + .025 * top);
}`);
    };
    material.customProgramCacheKey = () => key() + '-glass-v1';
    material.needsUpdate = true;
  }

  // --------------------------------------------------------------- desenho
  let lastValues = {}, lastFields = [];
  let lessonBeat = 0;
  // As três fichas do monitor central ficam pré-desenhadas em texturas próprias, já enviadas à GPU:
  // trocar de ficha (rolagem ou Voltar/Próxima) troca só o map, sem redesenhar 1024 px nem subir textura.
  const caseScreen = notebookScreens[1];
  const caseCards = [0, 1, 2].map(i => {
    if (i === 0) return {canvas: caseScreen.canvas, ctx: caseScreen.ctx, texture: caseScreen.texture, title: ''};
    const canvas = document.createElement('canvas');
    canvas.width = caseScreen.canvas.width; canvas.height = caseScreen.canvas.height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAniso;
    textures.add(texture);
    return {canvas, ctx: canvas.getContext('2d'), texture, title: ''};
  });
  function drawCaseCards() {
    for (let i = 0; i < caseCards.length; i++) { drawCaseScreen(caseCards[i], i); renderer?.initTexture?.(caseCards[i].texture); }
    showCaseCard();
  }
  function showCaseCard() {
    caseScreen.material.map = caseCards[lessonBeat].texture;
    caseScreen.mesh.userData.lessonBeat = lessonBeat;
    caseScreen.mesh.userData.lessonTitle = caseCards[lessonBeat].title;
  }
  function setLessonProgress(progress, reading = null) {
    const beat = reading === null ? (progress < 3.70 ? 0 : progress < 3.77 ? 1 : 2) : Math.min(2,Math.floor(reading*3));
    if (beat === lessonBeat) return;
    lessonBeat = beat;
    showCaseCard();
  }
  function setNotebook(values = {}, fields = []) {
    lastValues = values || {};
    lastFields = Array.isArray(fields) ? fields : [];
    const labels = {...FALLBACK_LABELS};
    for (const entry of lastFields) if (Array.isArray(entry) && entry[0]) labels[entry[0]] = entry[1] || labels[entry[0]] || entry[0];
    drawSourceScreen(notebookScreens[0]);
    drawDecisionScreen(notebookScreens[2], lastValues, labels);
  }
  function drawRear() {
    rearScreens.forEach((screen, i) => drawSessionScreen(screen, i));
    drawBrand(brandCanvas.getContext('2d'), brandCanvas.width, brandCanvas.height, {light: true});
    brandTexture.needsUpdate = true;
  }
  drawRear();
  setNotebook({}, []);
  drawCaseCards();
  if (typeof document !== 'undefined' && document.fonts?.load) {
    // Os dois pesos da Barlow precisam estar prontos; sem isso o canvas desenha em Arial.
    Promise.all([document.fonts.load(`80px ${DISPLAY}`), document.fonts.load(`400 40px ${BODY}`), document.fonts.load(`600 40px ${BODY}`)])
      .then(() => { if (!disposed) { drawRear(); setNotebook(lastValues, lastFields); drawCaseCards(); } })
      .catch(() => {});
  }

  // ----------------------------------------------------------------- humor
  const moodTargets = [...materials].filter(m => m.isMeshStandardMaterial);
  const dimmable = [graphite, charcoal, ice, slat, ceiling, drawer, benchTop, epoxy, bay, black, redPaint, stripeRed, plate];
  for (const m of dimmable) m.userData.albedo = m.color.clone();
  brandMaterial.userData.base = brandMaterial.color.clone();
  const mood = {debrief: 0, evaluate: 0};
  // debrief: teto apagado, contraluz vermelha baixa e telas traseiras; evaluate:
  // sala de análise à noite, com os monitores da ilha como luz dominante.
  // fix: Corrigir (piso quase preto); focus: close de peça na bancada (faixas do box apagadas).
  // monitor: peso da cena dedicada de leitura no monitor (monitor-scene.js).
  function setMood({debrief = 0, evaluate = 0, fix = 0, focus = 0, monitor = 0} = {}) {
    const mon = THREE.MathUtils.clamp(monitor, 0, 1);
    screenSpill.intensity = 7 * mon;
    wallGrazer.intensity = 5 * mon;
    const d = THREE.MathUtils.clamp(debrief, 0, 1), e = THREE.MathUtils.clamp(evaluate, 0, 1);
    // focus satura cedo: o close de 1,64 ainda está no fim do destaque.
    const f = THREE.MathUtils.clamp(fix, 0, 1), s = THREE.MathUtils.clamp(focus * 1.6, 0, 1);
    mood.debrief = d; mood.evaluate = e;
    const ceilingGain = (1 - .94 * e) * (1 - .96 * d);
    ledCool.color.copy(ledCool.userData.base).multiplyScalar(ceilingGain);
    ledSlat.color.copy(ledSlat.userData.base).multiplyScalar((1 - .94 * e) * (1 - .9 * d));
    overhead.intensity = lightBase.get(overhead) * (1 - .85 * e) * (1 - .95 * d);
    benchLamp.intensity = lightBase.get(benchLamp) * (1 - .85 * e) * (1 - .75 * d);
    if (deskLamp) deskLamp.intensity = lightBase.get(deskLamp) * (1 - .8 * e) * (1 - .5 * d);
    monitorGlow.intensity = lightBase.get(monitorGlow) * (1 + 1.4 * e + .4 * d) * (1 - .6 * mon);
    monitorWash.intensity = (34 * e + 2 * d) * (1 - .4 * mon);
    redWash.intensity = 14 * d * (1 - e);
    const islandGain = 1 + .35 * e + .15 * d, rearGain = (1 + .7 * d) * (1 - .25 * e);
    for (const s of notebookScreens) s.material.color.copy(s.material.userData.base).multiplyScalar(islandGain);
    for (const s of rearScreens) s.material.color.copy(s.material.userData.base).multiplyScalar(rearGain);
    brandMaterial.color.copy(brandMaterial.userData.base).multiplyScalar((1 + .6 * d) * (1 - .35 * e));
    stripeRed.emissiveIntensity = 1.6 * d;
    bandRed.emissiveIntensity = 2.4 * d;
    const albedo = (1 - .6 * e) * (1 - .72 * d);
    for (const m of dimmable) m.color.copy(m.userData.albedo).multiplyScalar(albedo);
    // No close da bancada as faixas desfocadas viravam barras vermelhas ao lado da peça estudada.
    redPaint.color.multiplyScalar(1 - .96 * s);
    // As placas de macaco (metálicas, fora do reflexo analítico) ficavam marrons em Corrigir e Encerrar.
    plate.color.multiplyScalar(1 - .75 * Math.max(f, d));
    for (const m of moodTargets) m.envMapIntensity = m.userData.env * (1 - .7 * e) * (1 - .7 * d) * (1 - .5 * f);
    redPaint.envMapIntensity *= 1 - .9 * s;
    floorUniforms.uLedGain.value = ceilingGain;
    floorUniforms.uScreenGain.value = rearGain;
    floorUniforms.uMonitorGain.value = 1 + 2.2 * e + .3 * d;
    floorUniforms.uBand.value = d;
    // Base .4: o brilho largo das luzes da cena (key quente, rim âmbar) lavava o epóxi de marrom.
    floorUniforms.uDirectSpec.value = .4 * (1 - .8 * e) * (1 - .85 * Math.max(d, f));
    // As direcionais da cena (key, rim âmbar, kicker) foram feitas para o carro; no epóxi
    // elas levantavam o preto (marrom em Corrigir e Encerrar). A sombra de contato mantém a
    // proporção, só o nível desce; o reflexo analítico das fontes do box continua.
    floorUniforms.uDirectDiffuse.value = .36 * (1 - .88 * Math.max(f, d));
  }

  // -------------------------------------------------------- oclusão por câmera
  const local = new THREE.Vector3();
  function update(dt, camera) {
    if (!camera) return;
    root.updateWorldMatrix(true, false);
    root.worldToLocal(local.copy(camera.getWorldPosition(local)));
    rearWall.visible = local.z > RZ + .14;
    sideWall.visible = local.x > SX + .14;
    // A laje só aparece enquanto as duas paredes que a sustentam estão visíveis.
    roof.visible = local.y < 3.1 && rearWall.visible && sideWall.visible;
    entrance.visible = local.z < 5.3;
    // Like the box walls, cut away the facade before the camera crosses its nearest face.
    facade.visible = local.z < 8.95;
    floorUniforms.uFloorCam.value.copy(local);
    floorUniforms.uRoofOn.value = roof.visible ? 1 : 0;
    floorUniforms.uRearOn.value = rearWall.visible ? 1 : 0;
  }

  function dispose() {
    disposed = true;
    root.removeFromParent();
    root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    envTarget?.dispose();
    envScene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  scene?.add(root);
  return {
    root,
    clip,
    envScene,
    anchors: {
      monitors: new THREE.Vector3(MON.x, MON.y, MON_Z[1]),
      rearScreens: new THREE.Vector3(rearScreenX[1], 1.74, RZ + .1),
      brand: brand.position.clone(),
    },
    setNotebook,
    setLessonProgress,
    setMood,
    update,
    dispose,
  };

  // ------------------------------------------------------------ utilitários
  function buildEnvScene() {
    // Sala escura com as fontes de luz do box, deslocada para o centro do carro.
    const env = new THREE.Scene();
    env.background = new THREE.Color('#0b1014');
    const g = new THREE.Group(); g.position.y = -.55; env.add(g); g.updateMatrixWorld();
    const room = new THREE.Mesh(new THREE.BoxGeometry(11.2, 3.8, 13.4), new THREE.MeshBasicMaterial({color: '#1a2731', side: THREE.BackSide}));
    room.position.set(0, 1.9, -.1); g.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({color: '#12181c'}));
    floor.rotation.x = -Math.PI / 2; floor.position.y = .01; g.add(floor);
    const panel = (w, h, pos, look, color, power) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide}));
      mesh.position.set(...pos); mesh.lookAt(look[0], look[1] + g.position.y, look[2]);
      g.add(mesh);
    };
    for (const z of [-4.2, -1.8, .6, 3]) panel(4.4, .26, [0, 3.2, z], [0, 0, z], '#eaf2ff', 6);
    panel(7.2, .07, [-.7, 2.42, -6.3], [-.7, 2.42, 0], '#eaf2ff', 5);
    panel(7.2, 1.2, [-.7, 1.8, -6.44], [-.7, 1.8, 0], '#35546c', .7);
    for (const x of rearScreenX) panel(1.5, .84, [x, 1.74, -6.38], [x, 1.74, 0], '#2a4760', 1.5);
    for (const z of MON_Z) panel(1.14, .64, [-4.7, 1.52, z], [0, 1.52, z], '#2c4b66', 1.7);
    // Softbox âmbar alto atrás do carro: no verniz, o Fresnel o desenha como linha quente
    // contínua no topo da carenagem e do halo (R10), sem luz pontual extra. Fica oculto no
    // mapa do próprio box (o epóxi o espalharia como mancha marrom) e só entra no do carro.
    panel(7.5, .38, [0, 3.35, -6.05], [0, .4, 0], '#ffa347', 5.5);
    env.userData.carOnly = g.children[g.children.length - 1];
    env.userData.carOnly.visible = false;
    panel(12, 2.2, [7.5, 1.5, 0], [0, 1.5, 0], '#5d7688', .75);
    panel(3.2, 1.6, [6, 6, 3], [0, .5, 0], '#ffc690', 2.4);
    panel(.4, .3, [LAMP.x + .35, 1.5, LAMP.z + .42], [LAMP.x + .35, 0, LAMP.z + .42], '#ffa24f', 10);
    return env;
  }

  // Cabeçalho comum das telas da ilha: barra vermelha, título e rótulo à direita.
  function screenHeader(ctx, W, s, title, tag) {
    const m = 52 * s;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = RED;
    ctx.fillRect(m, 40 * s, 12 * s, 66 * s);
    ctx.fillStyle = '#eef3f6';
    ctx.font = `${86 * s}px ${DISPLAY}`;
    ctx.fillText(title, m + 30 * s, 104 * s);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8ea6b4';
    ctx.font = `${24 * s}px ${BODY}`;
    setSpacing(ctx, 3 * s);
    ctx.fillText(tag, W - m, 74 * s);
    setSpacing(ctx, 0);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(210,228,240,.18)';
    ctx.fillRect(m, 128 * s, W - 2 * m, 2 * s);
    return m;
  }

  function drawSourceScreen(screen) {
    const {ctx, canvas, texture} = screen;
    const W = canvas.width, H = canvas.height, s = W / 1024;
    paintScreenBase(ctx, W, H);
    const m = screenHeader(ctx, W, s, 'REGISTRO DO TESTE', 'FONTE · 14/05/2026');
    CASE_SOURCE.forEach((sentence, i) => {
      const y = (190 + i * 92) * s;
      ctx.fillStyle = RED;
      ctx.font = `${58 * s}px ${DISPLAY}`;
      ctx.fillText(String(i + 1), m, y + 22 * s);
      ctx.fillStyle = '#dfe7ec';
      ctx.font = `${31 * s}px ${BODY}`;
      wrap(ctx, sentence, W - 2 * m - 56 * s, 2).forEach((line, k) => ctx.fillText(line, m + 56 * s, y + k * 38 * s));
    });
    ctx.fillStyle = '#8ea6b4';
    ctx.font = `${24 * s}px ${BODY}`;
    ctx.fillText('Setor de atendimento · 100 pedidos', m, 552 * s);
    texture.needsUpdate = true;
  }

  // The camera's existing push-in becomes a short lesson. Textures only upload
  // when a scroll beat changes; reversing the scroll restores the earlier card.
  function drawCaseScreen(screen, lessonBeat) {
    const {ctx, canvas, texture} = screen;
    const W = canvas.width, H = canvas.height, s = W / 1024;
    paintScreenBase(ctx, W, H);
    const m = 52 * s;
    const cards = [
      {title:'O QUE O TESTE MOSTROU', lines:['12 → 9 min'], detail:['Mediana de atendimento', '50 pedidos em cada versão'], source:'REGISTRO · FRASE 2'},
      {title:'O QUE MUDOU JUNTO', lines:['FORMULÁRIO', '+ EQUIPE'], detail:['Duas mudanças no mesmo teste.'], source:'REGISTRO · FRASE 3'},
      {title:'SÍNTESE DO TESTE', lines:['REDUÇÃO OBSERVADA', '12 → 9 MIN'], detail:['Formulário e equipe mudaram juntos'], source:'REGISTRO · FRASES 2 E 3'},
    ];
    const card = cards[lessonBeat];
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.fillStyle='#8ea6b4';ctx.font=`600 ${30*s}px ${BODY}`;
    ctx.fillText(card.title,m,78*s);
    ctx.fillStyle='#ffd447';ctx.font=`${(lessonBeat===0?174:lessonBeat===1?108:86)*s}px ${DISPLAY}`;
    card.lines.forEach((line,i)=>ctx.fillText(line,m,(lessonBeat===0?292:244+i*102)*s));
    ctx.fillStyle='#eef3f6';ctx.font=`${38*s}px ${BODY}`;
    card.detail.forEach((line,i)=>ctx.fillText(line,m,(410+i*48)*s));
    ctx.fillStyle='#8ea6b4';ctx.font=`${22*s}px ${BODY}`;
    ctx.fillText(card.source,m,540*s);
    for(let i=0;i<3;i++){
      ctx.fillStyle=i===lessonBeat?'#ffd447':'#34414a';
      ctx.fillRect(W-m-(3-i)*52*s,526*s,38*s,8*s);
    }
    screen.title=card.title;
    texture.needsUpdate = true;
  }

  // Direita: o registro do aluno quando existe; sem registro, a consequência do critério no caso.
  function drawDecisionScreen(screen, values, labels) {
    const {ctx, canvas, texture} = screen;
    const W = canvas.width, H = canvas.height, s = W / 1024;
    paintScreenBase(ctx, W, H);
    const filled = STUDENT_FIELDS.map(key => [key, typeof values[key] === 'string' ? values[key].trim() : '']).filter(([, v]) => v);
    if (filled.length) {
      const m = screenHeader(ctx, W, s, 'REGISTRO', 'PENDENTE DE CONFERÊNCIA');
      let y = 186 * s;
      for (const [key, value] of filled) {
        ctx.fillStyle = '#8ea6b4';
        ctx.font = `${22 * s}px ${BODY}`;
        setSpacing(ctx, 2.5 * s);
        ctx.fillText(String(labels[key] || key).toUpperCase(), m, y);
        setSpacing(ctx, 0);
        if (key === 'decision' && DECISIONS[value]) {
          ctx.fillStyle = '#eef3f6';
          ctx.font = `${72 * s}px ${DISPLAY}`;
          ctx.fillText(DECISIONS[value].toUpperCase(), m, y + 70 * s);
          y += 120 * s;
        } else {
          ctx.fillStyle = '#dfe7ec';
          ctx.font = `${32 * s}px ${BODY}`;
          const lines = wrap(ctx, value, W - 2 * m, 2);
          lines.forEach((line, k) => ctx.fillText(line, m, y + (42 + k * 38) * s));
          y += (70 + lines.length * 38) * s;
        }
      }
      texture.needsUpdate = true;
      return;
    }
    // Sem registro do aluno, telemetria da sessão, como as telas do fundo.
    const m = screenHeader(ctx, W, s, 'PRESSÕES', 'PSI · QUENTE');
    [['DE', '23.4', .78], ['DD', '23.6', .8], ['TE', '21.2', .7], ['TD', '21.5', .72]].forEach(([label, value, fraction], i) => {
      const x = (i % 2 ? 540 : 52) * s, y = (i < 2 ? 196 : 360) * s;
      ctx.fillStyle = '#8ea6b4'; ctx.font = `600 ${26 * s}px ${BODY}`; ctx.fillText(label, x, y);
      ctx.fillStyle = '#eef3f6'; ctx.font = `${104 * s}px ${DISPLAY}`; ctx.fillText(value, x, y + 104 * s);
      ctx.fillStyle = '#21343e'; ctx.fillRect(x + 220 * s, y + 28 * s, 14 * s, 80 * s);
      ctx.fillStyle = i < 2 ? '#b8cbd4' : '#b4464f'; ctx.fillRect(x + 220 * s, y + (28 + 80 * (1 - fraction)) * s, 14 * s, 80 * fraction * s);
    });
    ctx.fillStyle = '#8ea6b4';
    ctx.font = `${24 * s}px ${BODY}`;
    ctx.fillText('TL2 · VOLTA 04 · ALVO DIANT. 23.5 · TRAS. 21.3', m, 548 * s);
    texture.needsUpdate = true;
  }

  function drawSessionScreen(screen, index) {
    const {ctx, canvas, texture} = screen;
    const W = canvas.width, H = canvas.height, s = W / 1024;
    paintScreenBase(ctx, W, H);
    const m = 52 * s;
    ctx.fillStyle = '#7f98a8';
    ctx.font = `${24 * s}px ${BODY}`;
    setSpacing(ctx, 4 * s);
    ctx.fillText(['TEMPOS POR SETOR', 'TEMPERATURA DOS PNEUS', 'PROGRAMA DE PISTA'][index], m, 70 * s);
    ctx.textAlign = 'right';
    ctx.fillText('BOX 07', W - m, 70 * s);
    ctx.textAlign = 'left';
    setSpacing(ctx, 0);
    ctx.fillStyle = 'rgba(210,228,240,.14)';
    ctx.fillRect(m, 96 * s, W - 2 * m, 2 * s);
    if (index === 0) {
      ctx.fillStyle = '#edf2f4';
      ctx.font = `${144 * s}px ${DISPLAY}`;
      ctx.fillText('1:24.618', m, 250 * s);
      const sectors = [['S1', '27.452', .86], ['S2', '29.781', .94], ['S3', '27.385', .85]];
      sectors.forEach(([label, value, fraction], i) => {
        const y = (322 + i * 66) * s;
        ctx.fillStyle = '#8ea6b4'; ctx.font = `${30 * s}px ${BODY}`;
        ctx.fillText(label, m, y);
        ctx.fillStyle = '#cbdae1'; ctx.font = `${42 * s}px ${DISPLAY}`;
        ctx.fillText(value, m + 96 * s, y + 3 * s);
        ctx.fillStyle = '#21343e'; ctx.fillRect(m + 290 * s, y - 24 * s, 520 * s, 16 * s);
        ctx.fillStyle = i === 1 ? '#b8cbd4' : '#b4464f';
        ctx.fillRect(m + 290 * s, y - 24 * s, 520 * s * fraction, 16 * s);
      });
    } else if (index === 1) {
      [['DE', '92°'], ['DD', '91°'], ['TE', '96°'], ['TD', '95°']].forEach(([label, value], i) => {
        const x = (i % 2 ? 572 : 100) * s, y = (i < 2 ? 165 : 340) * s;
        ctx.fillStyle = '#8ea6b4'; ctx.font = `${28 * s}px ${BODY}`; ctx.fillText(label, x, y);
        ctx.fillStyle = '#edf2f4'; ctx.font = `${108 * s}px ${DISPLAY}`; ctx.fillText(value, x, y + 108 * s);
        ctx.fillStyle = '#b4464f'; ctx.fillRect(x + 210 * s, y + 20 * s, 16 * s, 90 * s);
      });
    } else {
      [['SAÍDA DOS BOXES', 'CONCLUÍDA'], ['SEQUÊNCIA LONGA', '04 / 12'], ['PRÓXIMA PARADA', 'VOLTA 12']].forEach(([label, value], i) => {
        const y = (164 + i * 126) * s;
        ctx.fillStyle = '#8ea6b4'; ctx.font = `${27 * s}px ${BODY}`; ctx.fillText(label, m, y);
        ctx.fillStyle = i === 1 ? '#d5646d' : '#d9e3e8'; ctx.font = `${70 * s}px ${DISPLAY}`;
        ctx.fillText(value, m, y + 68 * s);
      });
    }
    ctx.fillStyle = '#78909d'; ctx.font = `${21 * s}px ${BODY}`;
    ctx.fillText('TL2 · VOLTA 04 · PISTA 38 °C · AR 26 °C', m, 548 * s);
    texture.needsUpdate = true;
  }
}

function paintScreenBase(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W * .3, H);
  g.addColorStop(0, '#10202c');
  g.addColorStop(1, '#070e14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(120,170,205,.035)';
  for (let y = 0; y < H; y += Math.max(2, Math.round(H / 144))) ctx.fillRect(0, y, W, 1);
}

function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).slice(0, 800).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    while (ctx.measureText(word).width > maxWidth && word.length > 1) {
      let k = word.length - 1;
      while (k > 1 && ctx.measureText(word.slice(0, k)).width > maxWidth) k--;
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, k));
      word = word.slice(k);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else { lines.push(line); line = word; }
    if (lines.length > maxLines) break;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function makeGrain(size) {
  // Grão fino + manchas largas: o epóxi reflete de forma desigual, como piso usado.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  let seed = 7919;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 178 + rand() * 50;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 14; i++) {
    const x = rand() * size, y = rand() * size, r = size * (.12 + rand() * .25);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > .5;
    g.addColorStop(0, light ? 'rgba(255,255,255,.1)' : 'rgba(90,90,90,.1)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { ctx.save(); ctx.translate(ox, oy); ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore(); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function patchFloorReflection(material, uniforms, mobile) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloorPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFloorPos;
uniform vec3 uFloorCam;
uniform float uLedGain, uScreenGain, uMonitorGain, uBand, uDirectSpec, uDirectDiffuse, uRoofOn, uRearOn;
float floorRect(vec2 q, vec2 h, float blur) {
  vec2 d2 = abs(q) - h;
  float d = max(d2.x, d2.y);
  return (1.0 - smoothstep(-blur, blur, d)) * clamp(min(h.x, h.y) / blur, 0.0, 1.0);
}`)
      // Nos capítulos escuros o epóxi deixa de devolver o brilho das luzes diretas
      // da cena (rim/key): sobra só o reflexo das fontes do próprio box.
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.directSpecular *= uDirectSpec;
reflectedLight.directDiffuse *= uDirectDiffuse;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = vFloorPos - uFloorCam;
  if (V.y < -1e-4) {
    V = normalize(V);
    vec3 R = vec3(V.x, -V.y, V.z);
    float spread = .075 + roughnessFactor * .06;
    float breakup = .75 + .5 * (roughnessFactor / max(roughness, 1e-3) - .8);
    float F = .04 + .96 * pow(1. - clamp(-V.y, 0., 1.), 5.);
    vec3 glowSum = vec3(0.);
    float tc = (3.222 - vFloorPos.y) / R.y;
    vec2 hc = vFloorPos.xz + R.xz * tc;
    float bc = .015 + tc * spread;
    float strips = floorRect(hc - vec2(0., -4.2), vec2(2.2, .12), bc) + floorRect(hc - vec2(0., -1.8), vec2(2.2, .12), bc)
                 + floorRect(hc - vec2(0., .6), vec2(2.2, .12), bc) + floorRect(hc - vec2(0., 3.), vec2(2.2, .12), bc);
    glowSum += vec3(.93, 1., 1.1) * 3.2 * uLedGain * uRoofOn * strips;
    if (R.z < -1e-3) {
      float tr = (-6.33 - vFloorPos.z) / R.z;
      vec2 hr = vec2(vFloorPos.x + R.x * tr, vFloorPos.y + R.y * tr);
      float br = .015 + tr * spread;
      glowSum += vec3(.93, 1., 1.1) * 3.2 * uLedGain * uRearOn * floorRect(hr - vec2(-.7, 2.433), vec2(3.6, .03), br);
      glowSum += vec3(1., .1, .16) * 2.4 * uBand * uRearOn * floorRect(hr - vec2(-.7, 1.17), vec2(3.6, .08), br);
#ifndef FLOOR_MOBILE
      float rs = floorRect(hr - vec2(-2.35, 1.74), vec2(.75, .42), br) + floorRect(hr - vec2(-.7, 1.74), vec2(.75, .42), br) + floorRect(hr - vec2(.95, 1.74), vec2(.75, .42), br);
      glowSum += vec3(.05, .12, .22) * uScreenGain * uRearOn * rs;
#endif
    }
    if (R.x < -1e-3 && vFloorPos.x > -4.7) {
      float tm = (-4.716 - vFloorPos.x) / R.x;
      vec2 hm = vec2(vFloorPos.z + R.z * tm, vFloorPos.y + R.y * tm);
      float bm = .015 + tm * spread;
      float ms = floorRect(hm - vec2(0., 1.52), vec2(.57, .32), bm) + floorRect(hm - vec2(-1.35, 1.52), vec2(.57, .32), bm) + floorRect(hm - vec2(-2.7, 1.52), vec2(.57, .32), bm);
      glowSum += vec3(.06, .13, .24) * uMonitorGain * ms;
    }
    // O carro (x ±0,92; z ±2,56) bloqueia o que estaria atrás dele no reflexo.
    float tk = (.55 - vFloorPos.y) / R.y;
    vec2 kp = vFloorPos.xz + R.xz * tk;
    float carBlock = floorRect(kp, vec2(.9, 2.55), .12);
    totalEmissiveRadiance += glowSum * F * breakup * 1.3 * (1. - carBlock);
  }
}`);
    if (mobile) shader.fragmentShader = '#define FLOOR_MOBILE\n' + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => `garage-floor-v1${mobile ? '-m' : ''}`;
}
