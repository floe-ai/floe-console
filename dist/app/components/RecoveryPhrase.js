import { jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { phraseWords } from "../../identity/mnemonic.js";
/**
 * The one way a recovery phrase is shown, used by both first-run backup and
 * settings reveal. It renders the words in a numbered grid so they can be copied
 * onto paper in order. This is a backup to carry off the machine — not an
 * address to paste around — so it is always framed as something to write down
 * and keep, never as an identifier to share.
 */
export function RecoveryPhraseView({ phrase }) {
    const words = phraseWords(phrase);
    return (_jsx(Box, { flexDirection: "column", borderStyle: "round", paddingX: 1, children: chunk(words, 4).map((row, i) => (_jsx(Text, { children: row.map((w, j) => `${String(i * 4 + j + 1).padStart(2, " ")}. ${w}`).join("    ") }, i))) }));
}
function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
}
