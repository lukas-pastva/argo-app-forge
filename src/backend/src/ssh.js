/*  ssh.js – generate an RSA key pair and return in SSH + PEM format  */
import { generateKeyPairSync } from "node:crypto";
import sshpk from "sshpk";

export function genKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { format: "pem", type: "pkcs1" },
    privateKeyEncoding: { format: "pem", type: "pkcs1" },
  });

  /* convert PEM → OpenSSH string */
  const pubOpenSSH = sshpk.parseKey(publicKey, "pem").toString("ssh").trim();

  return {
    publicKey : pubOpenSSH,
    privateKey,
  };
}
