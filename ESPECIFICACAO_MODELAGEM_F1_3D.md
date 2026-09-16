# ESPECIFICAÇÃO DE ENGENHARIA E MODELAGEM 3D — FÓRMULA 1 2026
> **Documento canônico para IA modeladora 3D**  
> **Alvo:** carro didático da regulamentação 2026 (não o híbrido 2014–2025)  
> **Repositório:** `c:\Users\igorm\projetos\inteia-f1-loop`  
> **Geometria:** original INTEIA. Sem CAD de fabricante e sem malha Animagraffs.

---

## 0. Fontes 2026 (substitutos do Animagraffs)

O vídeo *How a Formula 1 Race Car Works* (Animagraffs, 2021) descreve a PU da era MGU-H / split-turbo / DRS / 110 kg. **Não é a referência deste carro.** Use o pacote abaixo.

| Papel | Material | URL |
| :--- | :--- | :--- |
| **Guia visual do carro** (equivalente ao tour Animagraffs) | F1 · *The Ultimate Guide To The 2026 F1 Cars* (Sam Collins) | [YouTube](https://www.youtube.com/watch?v=FC-sLnkcu_4) · [F1.com](https://www.formula1.com/en/video/the-ultimate-guide-to-the-2026-f1-cars.1858214949253929518) |
| Comparativo de casca | F1 · *Side by side: 2026 vs 2025* | [F1.com](https://www.formula1.com/en/video/side-by-side-how-different-are-2026-cars-vs-2025.1857678940824981735) |
| **Guia da unidade de potência** | F1 · *The 2026 Engine Regulations: All You Need To Know* | [YouTube](https://www.youtube.com/watch?v=ngwieh3s_fw) |
| Artigo PU (números) | F1 · *2026 regulations explained: new power units* | [F1.com](https://www.formula1.com/en/latest/article/2026-regulations-explained-all-you-need-to-know-about-f1s-new-power-units.14jfv7a36905uDJDdNyfQd) |
| Artigo aero | F1 · *X-mode / Z-mode* (depois: Straight Mode / Corner Mode) | [F1.com](https://www.formula1.com/en/latest/article/explained-2026-aerodynamic-regulations-fia-x-mode-z-mode-.26c1CtOzCmN3GfLMywrgb2) |
| Regulamento PU | FIA 2026 Power Unit Technical Regulations | [PDF FIA](https://www.fia.com/sites/default/files/fia_2026_formula_1_technical_regulations_pu_-_issue_7_-_2024-06-11_1.pdf) |
| Resumo FIA | *The MGUH will be removed. Variable trumpets… removed. ERS… 350 kW.* | [FIA file](https://www.fia.com/file/186874/download) |

Números que o modelo deve ensinar (didáticos, não homologação):

| Item | 2014–2025 | **2026** |
| :--- | :--- | :--- |
| ICE | ~550–560 kW | **~400 kW** |
| MGU-K | 120 kW | **350 kW** (~50/50) |
| MGU-H | sim (vale do V, split-turbo) | **proibido** |
| Trompetas | variáveis, com atuadores | **fixas** |
| Combustível de corrida | 110 kg · 100 kg/h | **70 kg** · **3000 MJ/h** |
| Energy Store | menor | **maior** (único ERS é o K) |
| Ultrapassagem | DRS (asa traseira, 1 s) | **aero ativa** (dianteira+traseira) + **MGU-K Override** |
| Entre-eixos / largura | 3600 / 2000 mm | **3400 / 1900 mm** |
| Massa mínima | ~798 kg | **768 kg** (piloto, sem combustível) |
| Assoalho | túneis Venturi | **parcialmente plano**, diffuser mais fraco, sem beam wing |

Animagraffs continua útil só como *anti-referência*: se a malha tiver compressor frontal + eixo coaxial + MGU-H no vale, está desenhando 2021.

---

## 1. O que já está no código (15/09/2026)

Caça a GLB drop-in licenciável: **não existe.** Overlay runtime em cima dos hashes INTEIA.

1. [`src/engine/hybrid-kit.js`](./src/engine/hybrid-kit.js) — jaqueta MGU-K maior, cabo HV, **seis trompetas fixas**, plenums, wastegates. **Sem** MGU-H, compressor frontal nem eixo split. `userData.regulation = 2026`.
2. [`src/engine/in-car.js`](./src/engine/in-car.js) — kit **depois** de `ENGINE_LENGTH`, senão o bay encolhe.
3. [`src/engine/viewer.js`](./src/engine/viewer.js) — explode `assembly_ers` / elétrico, não `mguh`. Copy PU 2026. Fonte: artigo F1 da PU.
4. [`src/engine/engine-shot.js`](./src/engine/engine-shot.js) — `ENGINE_PARTS.mguk`; chaves de câmera das três lições **intactas**.
5. [`src/car/internals-kit.js`](./src/car/internals-kit.js) — célula **menor** (~70 kg), Energy Store **maior**, óleo `y < 0.40`, câmbio, sidepods assimétricos, heave, pull-rods, tripóides, discos.
6. [`materia-prima/modulos-atualizados/mechanics.js`](./materia-prima/modulos-atualizados/mechanics.js) — flap traseiro **e** `front_wing_top` (Straight Mode). `setXMode` alias de `setDRS`.
7. [`materia-prima/modulos-atualizados/garage.js`](./materia-prima/modulos-atualizados/garage.js) — monitor `AERO RETA/CURVA`.
8. [`src/senna-driver.js`](./src/senna-driver.js) — HANS.
9. [`tools/inspect-power-unit.mjs`](./tools/inspect-power-unit.mjs) — inspeção do GLB shipped.

`public/assets/power-unit-v1.glb` permanece: manifesto já diz *MGU-K and no MGU-H*.

---

## 2. Mapa de arquivos

### 2.1 Unidade de potência — [`src/engine/in-car.js`](./src/engine/in-car.js)
`ENGINE_AT = (0, 0.43, -0.72)`, `ENGINE_LENGTH = 0.85`, `BAY.lip = 0.40`. Nós `assembly_*`. Rotativos: `assembly_rotating` (shader satin, fora do `cutPlane`). O turbo **não** é bipartido: um conjunto traseiro.

### 2.2 Câmera da aula — [`src/engine/engine-shot.js`](./src/engine/engine-shot.js)
Não mexer nas chaves das três lições (`crank`, `intake`, `turbo`). `mguk` é leitura extra. `mguh` é alias morto.

### 2.3 Aero ativa — [`materia-prima/modulos-atualizados/mechanics.js`](./materia-prima/modulos-atualizados/mechanics.js)
2026 não é DRS de proximidade. Straight Mode (ex-X-mode): flap traseiro **e** elemento dianteiro. Corner Mode (ex-Z-mode): ambos fechados. Override elétrico **não** é malha: é copy/telemetria.

### 2.4 Caixa do chassi — [`tools/car-hull.json`](./tools/car-hull.json)
Internos dentro de `main_body` `[-0.706, 0.137, -1.845]` → `[0.706, 1.025, 2.553]`. Zero clipping.

### 2.5 Cockpit — [`src/senna-driver.js`](./src/senna-driver.js)
HANS + ombreiras. Halo, se vier malha, é titânio em três pontos — o GLB atual **não** tem nó de halo.

---

## 3. Sistemas 2026

```
                         [ROLL HOOP / AIRBOX]
                                    |
              +---------------------+---------------------+
              |                     |                     |
     (arref. auxiliar)        (ar de admissão)    (arref. auxiliar)
              |                     |                     |
              |              [TROMPETAS FIXAS ×6]         |
              |              + 2 PLENUMS DE CARBONO       |
              |                     |                     |
              |              [BLOCO V6 1.6 90°]           |
              |              ICE ~400 kW                  |
              |                     |                     |
   [MGU-K 350 kW]----+     (coletores 3-em-1)             |
   (lado do cárter)  |              v                     |
                     |      [TURBO TRASEIRO ÚNICO]        |
                     |      + 2 WASTEGATES                |
                     v              |
              [ENERGY STORE]   [ESCAPE CENTRAL]
              (fundo do mono)
```

**Proibido na malha 2026:** compressor na face dianteira, eixo coaxial no vale, cilindro MGU-H, trompetas telescópicas, beam wing, túneis Venturi profundos.

### SISTEMA 1 — Chassi tripartite
Monocoque + bloco como membro estrutural + carcaça do câmbio. Sem alteração conceitual em relação ao didático anterior; o bay é mais apertado (entre-eixos 3400 mm).

### SISTEMA 2 — Power unit 2026
* **ICE:** V6 1.6 turbo, ~400 kW, 15 000 rpm. Fluxo de combustível em **energia** (3000 MJ/h), não 100 kg/h.
* **Turbo:** único, **atrás** do bloco. Sem MGU-H para spoolar: lag volta a ser problema real; wastegates visíveis.
* **MGU-K:** 350 kW, jaqueta maior que o cluster elétrico do GLB, cabo HV laranja até o ES. Única máquina elétrica de tração.
* **Admissão:** seis trompetas **fixas** (três por bancada) + plenums de carbono. Sem atuadores.
* **ERS:** um MGU, um CU-K, um ES. Colher até ~8,5–9 MJ/volta. Override: mais elétrico até ~337 km/h quando < 1 s do da frente — **não** abre asa.

Runtime: [`src/engine/hybrid-kit.js`](./src/engine/hybrid-kit.js). Nó raiz `assembly_ers`.

### SISTEMA 3 — Arrefecimento assimétrico
Ainda válido (o guia 2026 insiste em gills e outlets porque o pacote apertou):
* Esquerdo: intercooler ar-ar ~40°.
* Direito: água + óleo + radiador da bateria (o híbrido agora é 350 kW — esse radiador **cresce**, não some).
* Airbox: dois radiadores auxiliares.

Compressor frontal **não** alimenta o intercooler. Duto quente: turbo traseiro → sidepod esquerdo. Duto frio: intercooler → plenums. Runtime: `internal_charge_hot_duct` + `internal_charge_air_duct` em [`src/car/internals-kit.js`](./src/car/internals-kit.js).

### SISTEMA 4 — Suspensão
Dianteira push-rod + heave/Belleville + barras de torção. Traseira pull-rod + tripóides nos `rear_driveshaft`. Mantido.

### SISTEMA 5 — Combustível, bateria, segurança
* Célula Kevlar **menor**: 70 kg (não 110 / 145–150 L).
* Energy Store **maior**, no fundo, sob a célula.
* Tanque de óleo `y < 0.40` para não subir com a tampa.
* HANS no piloto. Luzes laterais de estado ERS: se modelar, são didáticas na carenagem.

### SISTEMA 6 — Aero 2026
* Asa dianteira mais estreita, flap de dois elementos.
* Asa traseira de três elementos, **sem beam wing**.
* Assoalho parcialmente plano; diffuser menos potente.
* **Straight Mode:** flaps dianteiro e traseiro abrem (baixo arrasto).
* **Corner Mode:** flaps na posição de downforce.
* Disponível em retas designadas; **não** exige 1 s do carro da frente.
* DRS 2011–2025 está morto como auxílio de ultrapassagem.

Cinemática: `setXMode` / `setDRS` em [`mechanics.js`](./materia-prima/modulos-atualizados/mechanics.js). Nomes de malha `rear_wing_drs*` são legado do GLB.

---

## 4. Nós glTF

| Nó | Função 2026 | Comportamento |
| :--- | :--- | :--- |
| `assembly_block` | Bloco / cabeçotes | `cutPlane` |
| `assembly_rotating` | Virabrequim, bielas, pistões | Sem corte; satin; mixer |
| `assembly_intake` | Plenums + trompetas **fixas** | Corte lateral |
| `assembly_turbo` | Turbo traseiro + wastegates | Sem corte |
| `assembly_electric` | MGU-K do GLB | `hiddenWhenCut` |
| `assembly_ers` | Overlay 2026 (jaqueta MGU-K, HV, trompetas) | Explode no inspetor |
| `assembly_exhaust_left` / `_right` | Coletores | Direito some no corte |
| `assembly_internals` | Combustível, ES, câmbio, coolers | Fica no chassi quando a casca explode |
| `assembly_mguh` | **Não usar.** Era 2021. |

---

## 5. Validação

```powershell
npm test
```

Inclui `tests/hybrid-kit.test.mjs` (sem MGU-H, 350 kW, 70 kg) e `tests/internals-kit.test.mjs`.

No inspetor: virabrequim, admissão com trompetas **fixas**, MGU-K lateral, turbo **traseiro**. Se aparecer eixo no vale ou compressor na cara do motor, a malha voltou para 2021.

Tampa do bay: `cover` sobe ~1,9 m; óleo e ES não viajam com ela.

Cinema: `tests/cinema.test.mjs` e `tests/engine-chapter.test.mjs` — câmera das três lições intocada.
