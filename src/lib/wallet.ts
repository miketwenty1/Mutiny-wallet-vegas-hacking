import * as bitcoin from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic, generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { ECPair, network } from "./bitcoin";

/** BIP32 versions for signet / testnet (tb1…). */
const BIP32_TESTNET = { private: 0x04358394, public: 0x043587cf };

const PURPOSE = 84;
const COIN_TYPE = 1; // testnet / signet
const ACCOUNT = 0;

export function createMnemonic12(): string {
  return generateMnemonic(wordlist, 128);
}

export function parseMnemonic(input: string): string[] {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function isValidMnemonic(words: string[]): boolean {
  return validateMnemonic(words.join(" "), wordlist);
}

export function rootFromMnemonic(mnemonic: string): HDKey {
  const words = parseMnemonic(mnemonic);
  if (!isValidMnemonic(words)) throw new Error("Invalid mnemonic");
  const seed = mnemonicToSeedSync(words.join(" "));
  return HDKey.fromMasterSeed(seed, BIP32_TESTNET);
}

export function derivePath(root: HDKey, path: string): HDKey {
  const k = root.derive(path);
  if (!k.privateKey && !k.publicKey) throw new Error("derive failed");
  return k;
}

export function accountRoot(root: HDKey): HDKey {
  return derivePath(root, `m/${PURPOSE}'/${COIN_TYPE}'/${ACCOUNT}'`);
}

export function receiveKey(root: HDKey, index: number): HDKey {
  return derivePath(root, `m/${PURPOSE}'/${COIN_TYPE}'/${ACCOUNT}'/0/${index}`);
}

export function changeKey(root: HDKey, index: number): HDKey {
  return derivePath(root, `m/${PURPOSE}'/${COIN_TYPE}'/${ACCOUNT}'/1/${index}`);
}

export function pubkeyHexCompressed(key: HDKey): string {
  const pk = key.publicKey;
  if (!pk || pk.length !== 33) throw new Error("missing compressed pubkey");
  return Buffer.from(pk).toString("hex");
}

export function p2wpkhAddress(key: HDKey): string {
  const pk = key.publicKey;
  if (!pk) throw new Error("missing pubkey");
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(pk),
    network,
  });
  if (!address) throw new Error("address encode failed");
  return address;
}

export function keypairForSigning(key: HDKey) {
  const sk = key.privateKey;
  if (!sk) throw new Error("missing private key");
  return ECPair.fromPrivateKey(Buffer.from(sk), { network });
}
