import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const path = join(dirname(fileURLToPath(import.meta.url)), "../public/assets/power-unit-v1.glb");
const buf = readFileSync(path);
const chunkLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8"));
const nodes = json.nodes || [];
const scenes = json.scenes || [];

function mat4(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation || [0, 0, 0];
  const r = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    s[0] * (1 - 2 * (yy + zz)), s[0] * (2 * (xy + wz)), s[0] * (2 * (xz - wy)), 0,
    s[1] * (2 * (xy - wz)), s[1] * (1 - 2 * (xx + zz)), s[1] * (2 * (yz + wx)), 0,
    s[2] * (2 * (xz + wy)), s[2] * (2 * (yz - wx)), s[2] * (1 - 2 * (xx + yy)), 0,
    t[0], t[1], t[2], 1
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function walk(i, parent, depth) {
  const n = nodes[i];
  const m = mul(parent, mat4(n));
  const name = n.name || ("#" + i);
  if (/assembly_|mgu|turbo|intake|block|head|exhaust|plenum|electric/i.test(name)) {
    console.log("  ".repeat(depth) + name + "  t=(" + m[12].toFixed(3) + ", " + m[13].toFixed(3) + ", " + m[14].toFixed(3) + ")");
  }
  for (const c of n.children || []) walk(c, m, depth + 1);
}
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
for (const root of scenes[0].nodes) walk(root, identity, 0);
