/** bitcoinjs-lib and deps expect Node globals in the browser bundle. */
import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer; global?: typeof globalThis };

if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;

/** bip174 / PSBT error paths call `JSON.stringify` on objects that may contain `BigInt`. */
const origStringify = JSON.stringify.bind(JSON) as typeof JSON.stringify;
JSON.stringify = function (value, replacer, space) {
  const strip = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
  if (replacer == null) return origStringify(value, strip, space);
  if (typeof replacer === "function") {
    return origStringify(value, function (this: unknown, key: string, val: unknown) {
      return replacer.call(this, key, strip(key, val));
    }, space);
  }
  return origStringify(value, replacer as never, space);
} as typeof JSON.stringify;
