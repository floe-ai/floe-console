import { deriveSecretKey, npubOf } from "./mnemonic.js";
import { encryptRecoveryPhrase, decryptRecoveryPhrase } from "./key-store.js";
import { saveIdentityFile, loadIdentityFile } from "./store-fs.js";
export function provisionIdentity(phrase, passphrase) {
    const secretKey = deriveSecretKey(phrase);
    const npub = npubOf(secretKey);
    const protection = passphrase.length === 0 ? "device" : "passphrase";
    saveIdentityFile(encryptRecoveryPhrase(phrase, npub, passphrase, protection));
    return { secretKey, npub };
}
/**
 * Reveal this machine's recovery phrase — the backup half of the same mechanism
 * import uses. Gated on the passphrase where one exists; a device-protected
 * identity (blank passphrase) reveals with an empty passphrase because the
 * device is the only thing guarding it, which the caller must state plainly.
 *
 * Throws if no identity exists, or IncorrectPassphraseError on a wrong passphrase.
 */
export function revealRecoveryPhrase(passphrase) {
    const file = loadIdentityFile();
    if (!file)
        throw new Error("There is no identity on this machine to reveal.");
    return decryptRecoveryPhrase(file, passphrase);
}
