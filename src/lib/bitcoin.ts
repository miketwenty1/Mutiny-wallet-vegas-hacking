import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

bitcoin.initEccLib(ecc);

export const ECPair = ECPairFactory(ecc);

/** Mutinynet is Core signet; witness addresses use the same HRP as testnet (`tb`). */
export const network: bitcoin.networks.Network = bitcoin.networks.testnet;
