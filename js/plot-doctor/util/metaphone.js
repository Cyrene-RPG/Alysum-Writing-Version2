/**
 * Plot Doctor — Metaphone phonetic code, adequate for fantasy-name spelling-variant
 * clustering. Not Double Metaphone; we only need rough "sounds alike" buckets.
 *
 * Algorithm follows Lawrence Philips' original Metaphone with the common simplifications.
 */

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/**
 * @param {string} input
 * @returns {string}
 */
export function metaphone(input) {
    let s = String(input ?? "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
    if (!s) return "";

    if (s.startsWith("AE")) s = s.slice(1);
    else if (s.startsWith("GN") || s.startsWith("KN") || s.startsWith("PN") || s.startsWith("WR")) {
        s = s.slice(1);
    } else if (s.startsWith("X")) {
        s = "S" + s.slice(1);
    } else if (s.startsWith("WH")) {
        s = "W" + s.slice(2);
    }

    let out = "";
    const len = s.length;
    let i = 0;
    while (i < len) {
        const c = s[i];
        const prev = i > 0 ? s[i - 1] : "";
        const next = i + 1 < len ? s[i + 1] : "";
        const next2 = i + 2 < len ? s[i + 2] : "";

        if (c === prev && c !== "C") {
            i++;
            continue;
        }

        switch (c) {
            case "A":
            case "E":
            case "I":
            case "O":
            case "U":
                if (i === 0) out += c;
                break;
            case "B":
                if (!(i === len - 1 && prev === "M")) out += "B";
                break;
            case "C":
                if (next === "I" && next2 === "A") out += "X";
                else if (next === "H") {
                    out += "X";
                    i++;
                } else if (next === "E" || next === "I" || next === "Y") out += "S";
                else out += "K";
                break;
            case "D":
                if (next === "G" && (next2 === "E" || next2 === "I" || next2 === "Y")) {
                    out += "J";
                    i += 2;
                } else out += "T";
                break;
            case "F":
                out += "F";
                break;
            case "G":
                if (next === "H") {
                    if (i + 2 < len && !VOWELS.has(s[i + 2])) {
                        i++;
                        break;
                    }
                    out += "F";
                    i++;
                } else if (next === "N") {
                    out += "N";
                    i++;
                } else if (next === "E" || next === "I" || next === "Y") out += "J";
                else out += "K";
                break;
            case "H":
                if (VOWELS.has(prev) && !VOWELS.has(next)) {
                    /* silent */
                } else out += "H";
                break;
            case "J":
                out += "J";
                break;
            case "K":
                if (prev !== "C") out += "K";
                break;
            case "L":
                out += "L";
                break;
            case "M":
                out += "M";
                break;
            case "N":
                out += "N";
                break;
            case "P":
                if (next === "H") {
                    out += "F";
                    i++;
                } else out += "P";
                break;
            case "Q":
                out += "K";
                break;
            case "R":
                out += "R";
                break;
            case "S":
                if (next === "H") {
                    out += "X";
                    i++;
                } else if (next === "I" && (next2 === "O" || next2 === "A")) out += "X";
                else out += "S";
                break;
            case "T":
                if (next === "H") {
                    out += "0";
                    i++;
                } else if (next === "I" && (next2 === "O" || next2 === "A")) out += "X";
                else out += "T";
                break;
            case "V":
                out += "F";
                break;
            case "W":
            case "Y":
                if (VOWELS.has(next)) out += c;
                break;
            case "X":
                out += "KS";
                break;
            case "Z":
                out += "S";
                break;
            default:
                break;
        }
        i++;
    }
    return out;
}
