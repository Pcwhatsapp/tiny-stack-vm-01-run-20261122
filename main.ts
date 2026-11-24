// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA (version 1).
// Runs every instance of a set in one process: reads /input/<id>/program.bin
// and input.bin, writes /output/<id>/stdout.bin and exit.txt.
// Semantics follow the ISA's reference VM exactly: 32-bit wrapping values,
// 256-value data stack, 64-deep call stack, 256 words of memory, ten traps
// with their own exit codes, a 1,000,000-step limit and a 65,536-byte output
// limit. Node 22 runs this file as it is (erasable syntax only).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_MAX = 65536;
const STEP_MAX = 1000000;

function run(p, inp) {
  const n = p.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const o = new Uint8Array(OUT_MAX);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const end = (code) => [o.subarray(0, ol), code];
  for (;;) {
    if (st === STEP_MAX) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    const known = op <= 7 || (op >= 0x10 && op <= 0x22) || (op >= 0x30 && op <= 0x34) || (op >= 0x40 && op <= 0x41) || (op >= 0x50 && op <= 0x53);
    if (!known) return end(5);
    const im = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (pc + im >= n) return end(9);
    st++;
    const bin = op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b;
    const need = op === 7 ? 3 : op === 5 || op === 6 || op === 0x41 || bin ? 2 : op === 3 || op === 4 || op === 0x17 || op === 0x1b || op === 0x31 || op === 0x32 || op === 0x40 || op === 0x50 || op === 0x51 || op === 0x53 ? 1 : 0;
    const push = op === 6 || op === 7 ? 3 : op === 4 ? 2 : op === 1 || op === 2 || op === 0x52 || bin || op === 0x17 || op === 0x1b || op === 0x40 ? 1 : 0;
    if (sp < need) return end(2);
    if (sp - need + push > 256) return end(3);
    pc += 1 + im;
    if (bin) {
      const b = D[sp - 1], a = D[sp - 2];
      let r;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) { if (!b) return end(4); r = (a / b) | 0; }
      else if (op === 0x14) { if (!b) return end(4); r = (a % b) | 0; }
      else if (op === 0x15) { if (!b) return end(4); r = ((a >>> 0) / (b >>> 0)) | 0; }
      else if (op === 0x16) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
      else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << b;
      else if (op === 0x1d) r = a >> b;
      else if (op === 0x1e) r = a >>> b;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      sp -= 2;
      D[sp++] = r;
      continue;
    }
    switch (op) {
      case 0x00:
        return end(0);
      case 0x01:
        D[sp++] = (p[pc - 1] << 24) >> 24;
        break;
      case 0x02:
        D[sp++] = p[pc - 4] | (p[pc - 3] << 8) | (p[pc - 2] << 16) | (p[pc - 1] << 24);
        break;
      case 0x03:
        sp--;
        break;
      case 0x04:
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 0x05: {
        const t = D[sp - 1];
        D[sp - 1] = D[sp - 2];
        D[sp - 2] = t;
        break;
      }
      case 0x06:
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 0x07: {
        const a = D[sp - 3];
        D[sp - 3] = D[sp - 2];
        D[sp - 2] = D[sp - 1];
        D[sp - 1] = a;
        break;
      }
      case 0x17:
        D[sp - 1] = -D[sp - 1] | 0;
        break;
      case 0x1b:
        D[sp - 1] = ~D[sp - 1];
        break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((p[pc - 2] | (p[pc - 1] << 8)) << 16) >> 16;
        if (op === 0x30) pc += rel;
        else { const v = D[--sp]; if ((op === 0x31) === (v === 0)) pc += rel; }
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        C[cp++] = pc;
        pc = p[pc - 2] | (p[pc - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a > 255) return end(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (ol + s.length > OUT_MAX) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) o[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > OUT_MAX) return end(11);
        o[ol++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53:
        return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [out, code] = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}
