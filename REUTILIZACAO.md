# Reutilizar os modelos e a aplicação

## Permissões

Código, documentação e modelos de autoria original INTEIA / Igor Morais Vasconcelos podem ser usados, modificados, redistribuídos e utilizados comercialmente sob a [licença MIT](LICENSE). Preserve o copyright e o texto da licença na sua cópia. Não precisa pedir autorização, ser aluno ou ter conta no GitHub para baixar.

O motor `power-unit-v1.glb` também conserva sua licença CC BY 4.0 já registrada no manifesto. Fontes, bibliotecas, gravações e imagens externas mantêm os próprios avisos. Conforme declaração de autoria de Igor Morais Vasconcelos em 21/09/2026, o vídeo foi usado como referência para as funções das peças; a modelagem disponibilizada é de sua autoria. A carroceria, suas versões GLB, o master Blender e os demais modelos autorais estão incluídos na licença MIT, com permissão de uso, modificação, redistribuição e uso comercial. Marcas não implicam endosso à sua adaptação.

## Download direto

| Conteúdo | Arquivo |
| --- | --- |
| Motor V6 original (CC BY 4.0 também disponível) | [Baixar power-unit-v1.glb](https://raw.githubusercontent.com/igormorais123/inteia-f1-loop/main/public/assets/power-unit-v1.glb) |
| Carro otimizado (MIT) | [Baixar carro-aula-v2.glb](https://raw.githubusercontent.com/igormorais123/inteia-f1-loop/main/public/assets/carro-aula-v2.glb) |
| Carro mobile (MIT) | [Baixar carro-aula-mobile-v2.glb](https://raw.githubusercontent.com/igormorais123/inteia-f1-loop/main/public/assets/carro-aula-mobile-v2.glb) |

[Baixar o projeto completo em ZIP](https://github.com/igormorais123/inteia-f1-loop/archive/refs/heads/main.zip). Extraia o ZIP antes de executar. Você também pode usar `git clone https://github.com/igormorais123/inteia-f1-loop.git`.

## Executar a aplicação

Instale Node.js 24 ou superior. Abra um terminal na pasta extraída e execute:

```sh
npm ci
npm run dev
```

Abra o endereço exibido no terminal. Para validar e gerar uma cópia estática: `npm test` e `npm run build`. A saída de produção fica em `dist/`. Não abra o HTML por duplo clique: módulos e carregamento de assets precisam de um servidor HTTP. Não são necessárias chaves de API.

O campo `private: true` no `package.json` apenas evita publicação acidental no registro npm; não impede download, execução, fork ou reutilização.

## Abrir no Blender ou em outro projeto 3D

No Blender, use **Arquivo → Importar → glTF 2.0** e selecione o `.glb`. Para o master `.blend`, use **Arquivo → Abrir**. Preserve os manifestos e avisos de licença junto dos modelos que redistribuir.

Para Three.js, copie o GLB para a pasta pública da sua aplicação e carregue por uma URL do seu próprio servidor:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const gltf = await loader.loadAsync('/assets/power-unit-v1.glb')
scene.add(gltf.scene) // scene é a cena da sua aplicação
```

O decoder é necessário para variantes comprimidas do carro. Para suas animações, use `THREE.AnimationMixer` com `gltf.animations`. Os modelos são ilustrativos e não são projetos de fabricação.
