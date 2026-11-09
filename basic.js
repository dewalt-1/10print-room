// Computer Room BASIC: a small Commodore-style BASIC with a PET-like
// 40x25 screen editor. Written for teaching; not an emulator.
"use strict";

const ROOM = (function () {
    const COLS = 40, ROWS = 25, SCREEN_ADDR = 32768, CHARSET_ADDR = 59468;
    const params = new URLSearchParams(location.search);
    const SPEED = Math.max(1, parseInt(params.get("speed"), 10) || 16); // statements per frame
    const PHOSPHOR = { white: [0xee, 0xf2, 0xf6], green: [0x41, 0xff, 0x6a], amber: [0xff, 0xb0, 0x00] };

    // ------------------------------------------------------------------ errors
    class BasicError extends Error {}
    const err = (m) => new BasicError(m);

    // ------------------------------------------------------------------ keywords
    const KW = ["END", "FOR", "NEXT", "DATA", "INPUT#", "INPUT", "DIM", "READ", "LET", "GOTO", "RUN", "IF",
        "RESTORE", "GOSUB", "RETURN", "REM", "STOP", "ON", "WAIT", "LOAD", "SAVE", "VERIFY", "DEF", "POKE",
        "PRINT#", "PRINT", "CONT", "LIST", "CLR", "CMD", "SYS", "OPEN", "CLOSE", "GET", "NEW", "TAB(", "TO",
        "FN", "SPC(", "THEN", "NOT", "STEP", "AND", "OR", "SGN", "INT", "ABS", "USR", "FRE", "POS", "SQR",
        "RND", "LOG", "EXP", "COS", "SIN", "TAN", "ATN", "PEEK", "LEN", "STR$", "VAL", "ASC", "CHR$",
        "LEFT$", "RIGHT$", "MID$", "GO"];
    const T = {};
    KW.forEach((k, i) => (T[k] = 256 + i));
    const TCH = (k) => String.fromCharCode(T[k]);

    // ------------------------------------------------------------------ screen
    const screen = new Uint8Array(COLS * ROWS).fill(32);
    const link = new Uint8Array(ROWS); // link[r] = 1: row r continues row r-1 (one logical line)
    let cx = 0, cy = 0, rvs = false, lower = false;
    let inputX = 0, inputY = 0;
    const mem = new Uint8Array(65536);

    function petToScreen(c) {
        if (c < 32) return -1;
        if (c < 64) return c;
        if (c < 96) return c - 64;
        if (c < 128) return c - 32;
        if (c < 160) return -1;
        if (c < 192) return c - 64;
        if (c < 255) return c - 128;
        return 94;
    }
    function screenToPet(s) {
        s &= 127;
        if (s < 32) return s + 64;
        if (s < 64) return s;
        if (s < 96) return s + 128;
        return s + 64;
    }

    function scrollUp() {
        screen.copyWithin(0, COLS);
        screen.fill(32, COLS * (ROWS - 1));
        link.copyWithin(0, 1);
        link[0] = 0;
        link[ROWS - 1] = 0;
        cy--;
        inputY--;
    }
    const lineStart = (r) => (r > 0 && link[r] ? r - 1 : r);
    const lineRows = (s) => (s + 1 < ROWS && link[s + 1] ? 2 : 1);

    function newline() {
        const s = lineStart(cy);
        cy = s + lineRows(s);
        cx = 0;
        while (cy >= ROWS) scrollUp();
        link[cy] = 0;
        rvs = false;
    }
    function clearScreen() {
        screen.fill(32);
        link.fill(0);
        cx = cy = 0;
    }
    function putScreen(code) {
        screen[cy * COLS + cx] = code;
        cx++;
        if (cx >= COLS) {
            const cont = link[cy];
            cx = 0;
            cy++;
            if (cy >= ROWS) scrollUp();
            link[cy] = cont ? 0 : 1;
        }
    }
    function cursorRight() {
        cx++;
        if (cx >= COLS) {
            cx = 0;
            cy++;
            if (cy >= ROWS) scrollUp();
        }
    }
    function cursorLeft() {
        if (cx > 0) cx--;
        else if (cy > 0) { cy--; cx = COLS - 1; }
    }
    function cursorDown() {
        cy++;
        if (cy >= ROWS) scrollUp();
    }
    function cursorUp() {
        if (cy > 0) cy--;
    }

    // Logical line under the cursor as an array of screen-cell indices.
    function lineCells(s) {
        const cells = [];
        for (let r = s; r < s + lineRows(s); r++) for (let x = 0; x < COLS; x++) cells.push(r * COLS + x);
        return cells;
    }
    function deleteChar() {
        const s = lineStart(cy), cells = lineCells(s);
        const at = (cy - s) * COLS + cx;
        if (at === 0) return;
        for (let i = at - 1; i < cells.length - 1; i++) screen[cells[i]] = screen[cells[i + 1]];
        screen[cells[cells.length - 1]] = 32;
        cursorLeft();
    }
    function insertChar() {
        const s = lineStart(cy), cells = lineCells(s);
        const at = (cy - s) * COLS + cx;
        for (let i = cells.length - 1; i > at; i--) screen[cells[i]] = screen[cells[i - 1]];
        screen[cells[at]] = 32;
    }
    function insertRowAfter(r) {
        if (r + 1 < ROWS - 1) {
            screen.copyWithin((r + 2) * COLS, (r + 1) * COLS, (ROWS - 1) * COLS);
            link.copyWithin(r + 2, r + 1, ROWS - 1);
        }
        screen.fill(32, (r + 1) * COLS, (r + 2) * COLS);
        link[r + 1] = 1;
    }
    function typeChar(code) {
        screen[cy * COLS + cx] = code;
        cx++;
        if (cx < COLS) return;
        if (link[cy]) { cx = COLS - 1; return; } // logical lines are at most two rows
        if (cy === ROWS - 1) scrollUp();
        if (!link[cy + 1]) insertRowAfter(cy);
        cy++;
        cx = 0;
    }

    function printPet(c) {
        switch (c) {
            case 13: case 141: newline(); return;
            case 147: clearScreen(); return;
            case 19: cx = cy = 0; return;
            case 17: cursorDown(); return;
            case 145: cursorUp(); return;
            case 29: cursorRight(); return;
            case 157: cursorLeft(); return;
            case 18: rvs = true; return;
            case 146: rvs = false; return;
            case 14: lower = true; return;
            case 142: lower = false; return;
            case 20: deleteChar(); return;
            case 148: insertChar(); return;
        }
        const s = petToScreen(c);
        if (s >= 0) putScreen(s | (rvs ? 128 : 0));
    }
    const out = (s) => { for (let i = 0; i < s.length; i++) printPet(s.charCodeAt(i)); };

    // ------------------------------------------------------------------ program store
    const prog = new Map();
    let lines = [], lineIdx = new Map();
    function reindex() {
        lines = [...prog.keys()].sort((a, b) => a - b);
        lineIdx = new Map(lines.map((n, i) => [n, i]));
    }

    function crunch(s) {
        let o = "", i = 0, inQ = false, inData = false;
        while (i < s.length) {
            const c = s.charCodeAt(i);
            if (c === 34) { inQ = !inQ; o += '"'; i++; continue; }
            if (inQ) { o += s[i++]; continue; }
            if (inData) { if (c === 58) inData = false; o += s[i++]; continue; }
            if (c === 63) { o += TCH("PRINT"); i++; continue; }
            let hit = null;
            if (c >= 65 && c <= 90) for (const k of KW) if (s.startsWith(k, i)) { hit = k; break; }
            if (!hit) { o += s[i++]; continue; }
            o += TCH(hit);
            i += hit.length;
            if (hit === "REM") { o += s.slice(i); break; }
            if (hit === "DATA") inData = true;
        }
        return o;
    }

    // Plain text <-> PET codes, for paste, files and links.
    const NAMED = { clr: 147, home: 19, "rvs on": 18, "rvs off": 146, down: 17, up: 145, left: 157, right: 29 };
    const UNI = { "╲": 205, "╱": 206, "╳": 214, "♥": 211, "●": 209, "○": 215, "♠": 193, "♣": 216, "♦": 218,
        "─": 192, "│": 221, "┼": 219, "π": 222, "£": 92, "▒": 166 };
    function fromText(line) {
        let o = "";
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === "{") {
                const end = line.indexOf("}", i);
                if (end > i) {
                    const name = line.slice(i + 1, end).toLowerCase();
                    const n = /^\d+$/.test(name) ? parseInt(name, 10) : NAMED[name];
                    if (n !== undefined && n < 256) { o += String.fromCharCode(n); i = end; continue; }
                }
            }
            if (UNI[ch]) { o += String.fromCharCode(UNI[ch]); continue; }
            let c = ch.charCodeAt(0);
            if (c >= 97 && c <= 122) c -= 32;
            else if (ch === "^") c = 94;
            else if (ch === "_") c = 95;
            else if (ch === "\t") c = 32;
            if (c >= 32 && c <= 95) o += String.fromCharCode(c);
        }
        return o;
    }
    function toText(s) {
        let o = "", inQ = false;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c >= 256) { o += KW[c - 256]; continue; }
            if (c === 34) inQ = !inQ;
            if (c === 94) o += "^";
            else if (c === 95) o += "_";
            else if (c >= 32 && c < 94) o += String.fromCharCode(c);
            else o += "{" + c + "}";
        }
        return o;
    }
    function exportProgram() {
        return lines.map((n) => n + " " + toText(prog.get(n))).join("\n") + "\n";
    }

    // ------------------------------------------------------------------ interpreter state
    let mode = "edit"; // edit | run | input
    let vars = new Map(), arrays = new Map(), fns = new Map();
    let forStack = [], gosubStack = [];
    let data = { idx: 0, pos: 0, inData: false };
    let contState = null, inputState = null;
    let P = { text: "", pos: 0 };
    let curIdx = -1, directText = "", needSep = false;
    const keyBuf = [];
    let t0 = performance.now();
    let rndState = (Math.random() * 4294967296) >>> 0;

    function clearVars() {
        vars = new Map(); arrays = new Map(); fns = new Map();
        forStack = []; gosubStack = [];
        data = { idx: 0, pos: 0, inData: false };
    }
    function setPos(idx, pos) {
        curIdx = idx;
        P = { text: idx < 0 ? directText : prog.get(lines[idx]), pos };
    }

    const isLetter = (c) => c >= 65 && c <= 90;
    const isDigit = (c) => c >= 48 && c <= 57;
    function peek() {
        while (P.pos < P.text.length && P.text.charCodeAt(P.pos) === 32) P.pos++;
        return P.pos < P.text.length ? P.text.charCodeAt(P.pos) : -1;
    }
    function accept(c) {
        if (peek() === c) { P.pos++; return true; }
        return false;
    }
    function expect(c) {
        if (!accept(c)) throw err("SYNTAX");
    }
    const atEnd = () => { const c = peek(); return c < 0 || c === 58; };
    function skipStatement() {
        let inQ = false;
        while (P.pos < P.text.length) {
            const c = P.text.charCodeAt(P.pos);
            if (c === 34) inQ = !inQ;
            else if (c === 58 && !inQ) return;
            P.pos++;
        }
    }

    // ------------------------------------------------------------------ values
    function numStr(n) {
        if (!isFinite(n)) throw err("OVERFLOW");
        let s;
        const a = Math.abs(n);
        if (n === 0) s = "0";
        else if (a >= 1e9 || a < 0.01) {
            let e = Math.floor(Math.log10(a));
            let m = +(a / Math.pow(10, e)).toPrecision(9);
            if (m >= 10) { m /= 10; e++; }
            s = String(m) + "E" + (e < 0 ? "-" : "+") + String(Math.abs(e)).padStart(2, "0");
        } else {
            s = String(+a.toPrecision(9));
            if (s.startsWith("0.")) s = s.slice(1);
        }
        return (n < 0 ? "-" : " ") + s;
    }
    function num(v) {
        if (typeof v !== "number") throw err("TYPE MISMATCH");
        return v;
    }
    function str(v) {
        if (typeof v !== "string") throw err("TYPE MISMATCH");
        return v;
    }
    function int16(v) {
        v = Math.floor(num(v));
        if (v < -32768 || v > 32767) throw err("ILLEGAL QUANTITY");
        return v;
    }
    function checkNum(v) {
        if (!isFinite(v) || Math.abs(v) > 1.7e38) throw err("OVERFLOW");
        return v;
    }
    function rnd(x) {
        if (x < 0) rndState = (Math.floor(Math.abs(x) * 1000003) ^ 0x9e3779b9) >>> 0;
        else if (x === 0) rndState = (rndState ^ Math.floor(performance.now() * 1000)) >>> 0;
        let t = (rndState = (rndState + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const jiffies = () => Math.floor(((performance.now() - t0) * 60) / 1000);
    function timeStr() {
        const sec = Math.floor(jiffies() / 60) % 86400;
        const p = (n) => String(n).padStart(2, "0");
        return p(Math.floor(sec / 3600)) + p(Math.floor(sec / 60) % 60) + p(sec % 60);
    }
    function peekMem(a) {
        a = Math.floor(num(a));
        if (a < 0 || a > 65535) throw err("ILLEGAL QUANTITY");
        if (a >= SCREEN_ADDR && a < SCREEN_ADDR + COLS * ROWS) return screen[a - SCREEN_ADDR];
        if (a === CHARSET_ADDR) return lower ? 14 : 12;
        return mem[a];
    }
    function pokeMem(a, v) {
        a = Math.floor(num(a));
        v = Math.floor(num(v));
        if (a < 0 || a > 65535 || v < 0 || v > 255) throw err("ILLEGAL QUANTITY");
        if (a >= SCREEN_ADDR && a < SCREEN_ADDR + COLS * ROWS) screen[a - SCREEN_ADDR] = v;
        else if (a === CHARSET_ADDR) lower = (v & 2) !== 0;
        else mem[a] = v;
    }

    // ------------------------------------------------------------------ variables
    function varName() {
        let c = peek();
        if (!isLetter(c)) throw err("SYNTAX");
        let name = String.fromCharCode(c);
        P.pos++;
        while (P.pos < P.text.length) {
            c = P.text.charCodeAt(P.pos);
            if (isLetter(c) || isDigit(c)) { if (name.length < 2) name += String.fromCharCode(c); P.pos++; }
            else break;
        }
        if (P.pos < P.text.length) {
            c = P.text.charCodeAt(P.pos);
            if (c === 36) { name += "$"; P.pos++; } else if (c === 37) { name += "%"; P.pos++; }
        }
        return name;
    }
    const isStrName = (n) => n.endsWith("$");
    function getVar(n) {
        if (n === "TI") return jiffies();
        if (n === "TI$") return timeStr();
        if (n === "ST") return 0;
        const v = vars.get(n);
        return v === undefined ? (isStrName(n) ? "" : 0) : v;
    }
    function makeArray(n, dims) {
        let size = 1;
        dims.forEach((d) => { if (d < 0) throw err("ILLEGAL QUANTITY"); size *= d + 1; });
        if (size > 32767) throw err("OUT OF MEMORY");
        const a = { dims, data: new Array(size).fill(isStrName(n) ? "" : 0) };
        arrays.set(n, a);
        return a;
    }
    function element(n) {
        expect(40);
        const idx = [];
        do idx.push(int16(expr())); while (accept(44));
        expect(41);
        const a = arrays.get(n) || makeArray(n, idx.map(() => 10));
        if (a.dims.length !== idx.length) throw err("BAD SUBSCRIPT");
        let off = 0;
        idx.forEach((v, i) => {
            if (v < 0 || v > a.dims[i]) throw err("BAD SUBSCRIPT");
            off = off * (a.dims[i] + 1) + v;
        });
        return { a, off };
    }
    function ref() {
        const n = varName();
        if (peek() === 40) {
            const e = element(n);
            return { n, get: () => e.a.data[e.off], set: (v) => (e.a.data[e.off] = v) };
        }
        return {
            n,
            get: () => getVar(n),
            set: (v) => {
                if (n === "TI$") {
                    const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v);
                    if (!m) throw err("ILLEGAL QUANTITY");
                    t0 = performance.now() - ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000);
                } else if (n === "TI" || n === "ST") throw err("SYNTAX");
                else vars.set(n, v);
            },
        };
    }
    function assign(r, v) {
        if (isStrName(r.n)) {
            if (str(v).length > 255) throw err("STRING TOO LONG");
        } else {
            num(v);
            if (r.n.endsWith("%")) {
                v = Math.floor(v);
                if (v < -32768 || v > 32767) throw err("ILLEGAL QUANTITY");
            }
        }
        r.set(v);
    }

    // ------------------------------------------------------------------ expressions
    function expr() {
        let a = andExpr();
        while (accept(T.OR)) a = int16(a) | int16(andExpr());
        return a;
    }
    function andExpr() {
        let a = notExpr();
        while (accept(T.AND)) a = int16(a) & int16(notExpr());
        return a;
    }
    function notExpr() {
        if (accept(T.NOT)) return ~int16(notExpr());
        return relExpr();
    }
    function relExpr() {
        let a = addExpr();
        for (;;) {
            let op = 0, c;
            while ((c = peek()) === 60 || c === 61 || c === 62) {
                op |= c === 60 ? 1 : c === 61 ? 2 : 4;
                P.pos++;
            }
            if (!op) return a;
            const b = addExpr();
            if (typeof a !== typeof b) throw err("TYPE MISMATCH");
            a = (op & 1 && a < b) || (op & 2 && a === b) || (op & 4 && a > b) ? -1 : 0;
        }
    }
    function addExpr() {
        let a = mulExpr();
        for (;;) {
            if (accept(43)) {
                const b = mulExpr();
                if (typeof a === "string") {
                    a = a + str(b);
                    if (a.length > 255) throw err("STRING TOO LONG");
                } else a = checkNum(a + num(b));
            } else if (accept(45)) a = checkNum(num(a) - num(mulExpr()));
            else return a;
        }
    }
    function mulExpr() {
        let a = unary();
        for (;;) {
            if (accept(42)) a = checkNum(num(a) * num(unary()));
            else if (accept(47)) {
                const b = num(unary());
                if (b === 0) throw err("DIVISION BY ZERO");
                a = checkNum(num(a) / b);
            } else return a;
        }
    }
    function unary() {
        if (accept(45)) return -num(unary());
        if (accept(43)) return unary();
        return power();
    }
    function power() {
        let a = atom();
        while (accept(94)) {
            const b = accept(45) ? -num(atom()) : num(atom());
            const r = Math.pow(num(a), b);
            if (isNaN(r)) throw err("ILLEGAL QUANTITY");
            a = checkNum(r);
        }
        return a;
    }
    function args(n) {
        expect(40);
        const v = [expr()];
        while (v.length < n && accept(44)) v.push(expr());
        expect(41);
        return v;
    }
    function stringLiteral() {
        P.pos++; // opening quote
        let s = "";
        while (P.pos < P.text.length && P.text.charCodeAt(P.pos) !== 34) s += P.text[P.pos++];
        if (P.pos < P.text.length) P.pos++;
        return s;
    }
    function atom() {
        const c = peek();
        if (c < 0) throw err("SYNTAX");
        if (isDigit(c) || c === 46) return number();
        if (c === 34) return stringLiteral();
        if (c === 40) { P.pos++; const v = expr(); expect(41); return v; }
        if (isLetter(c)) {
            const n = varName();
            if (peek() === 40 && n !== "TI" && n !== "TI$" && n !== "ST") { const e = element(n); return e.a.data[e.off]; }
            return getVar(n);
        }
        if (c < 256) throw err("SYNTAX");
        P.pos++;
        const k = KW[c - 256];
        let a, x;
        switch (k) {
            case "NOT": return ~int16(relExpr());
            case "FN": return callFn();
            case "SGN": return Math.sign(num(args(1)[0]));
            case "INT": return Math.floor(num(args(1)[0]));
            case "ABS": return Math.abs(num(args(1)[0]));
            case "SQR": x = num(args(1)[0]); if (x < 0) throw err("ILLEGAL QUANTITY"); return Math.sqrt(x);
            case "RND": return rnd(num(args(1)[0]));
            case "LOG": x = num(args(1)[0]); if (x <= 0) throw err("ILLEGAL QUANTITY"); return Math.log(x);
            case "EXP": return checkNum(Math.exp(num(args(1)[0])));
            case "COS": return Math.cos(num(args(1)[0]));
            case "SIN": return Math.sin(num(args(1)[0]));
            case "TAN": return checkNum(Math.tan(num(args(1)[0])));
            case "ATN": return Math.atan(num(args(1)[0]));
            case "PEEK": return peekMem(args(1)[0]);
            case "LEN": return str(args(1)[0]).length;
            case "STR$": return numStr(num(args(1)[0]));
            case "VAL": {
                const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(str(args(1)[0]).replace(/ /g, ""));
                return m ? parseFloat(m[0]) : 0;
            }
            case "ASC": a = str(args(1)[0]); if (!a.length) throw err("ILLEGAL QUANTITY"); return a.charCodeAt(0);
            case "CHR$": x = Math.floor(num(args(1)[0])); if (x < 0 || x > 255) throw err("ILLEGAL QUANTITY"); return String.fromCharCode(x);
            case "LEFT$": a = args(2); x = Math.floor(num(a[1])); if (x < 0 || x > 255) throw err("ILLEGAL QUANTITY"); return str(a[0]).slice(0, x);
            case "RIGHT$": a = args(2); x = Math.floor(num(a[1])); if (x < 0 || x > 255) throw err("ILLEGAL QUANTITY"); return x ? str(a[0]).slice(-x) : "";
            case "MID$": {
                a = args(3);
                const s = str(a[0]), st = Math.floor(num(a[1]));
                const ln = a.length > 2 ? Math.floor(num(a[2])) : 255;
                if (st < 1 || st > 255 || ln < 0 || ln > 255) throw err("ILLEGAL QUANTITY");
                return s.substr(st - 1, ln);
            }
            case "FRE": args(1); return bytesFree();
            case "POS": args(1); return cx;
            case "USR": throw err("ILLEGAL QUANTITY");
        }
        throw err("SYNTAX");
    }
    function number() {
        let s = "", c;
        while ((c = peek()) >= 0) {
            if (isDigit(c)) s += String.fromCharCode(c);
            else if (c === 46 && !s.includes(".")) s += ".";
            else break;
            P.pos++;
        }
        if (peek() === 69) {
            const save = P.pos;
            P.pos++;
            let e = "E";
            c = peek();
            if (c === 43 || c === 45) { e += String.fromCharCode(c); P.pos++; }
            let d = "";
            while (isDigit((c = peek()))) { d += String.fromCharCode(c); P.pos++; }
            if (d) s += e + d; else P.pos = save;
        }
        const v = s === "." ? 0 : parseFloat(s);
        return checkNum(v);
    }
    function callFn() {
        const n = varName();
        const f = fns.get(n);
        if (!f) throw err("UNDEF'D FUNCTION");
        expect(40);
        const arg = num(expr());
        expect(41);
        const old = vars.get(f.param), saveP = P;
        vars.set(f.param, arg);
        P = { text: f.text, pos: f.pos };
        try { return expr(); } finally { P = saveP; if (old === undefined) vars.delete(f.param); else vars.set(f.param, old); }
    }
    function lineNumber() {
        let s = "", c;
        while (isDigit((c = peek()))) { s += String.fromCharCode(c); P.pos++; }
        return s ? parseInt(s, 10) : 0;
    }
    function bytesFree() {
        let used = 0;
        prog.forEach((t) => (used += t.length + 5));
        return Math.max(0, 31743 - used);
    }

    // ------------------------------------------------------------------ control flow
    function gotoLine(n) {
        if (!lineIdx.has(n)) throw err("UNDEF'D STATEMENT");
        setPos(lineIdx.get(n), 0);
        needSep = false;
    }
    function ready() {
        if (cx !== 0) newline();
        out("READY.");
        newline();
        mode = "edit";
        keyBuf.length = 0;
    }
    function endProgram() {
        ready();
    }
    function saveCont() {
        contState = curIdx >= 0 ? { idx: curIdx, pos: P.pos, needSep } : null;
    }
    function breakProgram() {
        if (mode !== "run" && mode !== "input") return;
        if (mode === "input") P.pos = inputState.stmtEnd;
        saveCont();
        if (cx !== 0) newline();
        out(curIdx >= 0 ? "BREAK IN " + lines[curIdx] : "BREAK");
        ready();
    }
    function startRun(n) {
        clearVars();
        contState = null;
        if (!lines.length) { endProgram(); return; }
        if (n !== undefined) gotoLine(n); else setPos(0, 0);
        needSep = false;
        mode = "run";
    }

    function step() {
        for (;;) {
            const c = peek();
            if (c < 0) {
                if (curIdx < 0) { endProgram(); return; }
                if (curIdx + 1 >= lines.length) { saveCont(); endProgram(); return; }
                setPos(curIdx + 1, 0);
                needSep = false;
                continue;
            }
            if (c === 58) { P.pos++; needSep = false; continue; }
            if (needSep) throw err("SYNTAX");
            break;
        }
        needSep = true;
        statement();
    }

    function statement() {
        const c = peek();
        if (isLetter(c)) return letStmt();
        if (c < 256) throw err("SYNTAX");
        P.pos++;
        switch (KW[c - 256]) {
            case "PRINT": return printStmt();
            case "LET": return letStmt();
            case "GOTO": return gotoLine(lineNumber());
            case "GO": expect(T.TO); return gotoLine(lineNumber());
            case "GOSUB": {
                const n = lineNumber();
                if (gosubStack.length > 200) throw err("OUT OF MEMORY");
                gosubStack.push({ idx: curIdx, pos: P.pos, text: P.text });
                return gotoLine(n);
            }
            case "RETURN": {
                const f = gosubStack.pop();
                if (!f) throw err("RETURN WITHOUT GOSUB");
                curIdx = f.idx;
                P = { text: f.text, pos: f.pos };
                return;
            }
            case "IF": {
                let v = expr();
                const truth = typeof v === "string" ? v.length > 0 : v !== 0;
                if (accept(T.THEN)) {
                    if (isDigit(peek())) { const n = lineNumber(); if (truth) gotoLine(n); else P.pos = P.text.length; return; }
                } else if (accept(T.GOTO)) {
                    const n = lineNumber(); if (truth) gotoLine(n); else P.pos = P.text.length; return;
                } else throw err("SYNTAX");
                if (truth) needSep = false; else P.pos = P.text.length;
                return;
            }
            case "FOR": return forStmt();
            case "NEXT": return nextStmt();
            case "END": saveCont(); return endProgram();
            case "STOP": saveCont(); if (cx) newline(); out(curIdx >= 0 ? "BREAK IN " + lines[curIdx] : "BREAK"); return ready();
            case "REM": P.pos = P.text.length; return;
            case "DATA": return skipStatement();
            case "READ": do assignFromData(ref()); while (accept(44)); return;
            case "RESTORE": data = { idx: 0, pos: 0, inData: false }; return;
            case "DIM": return dimStmt();
            case "DEF": return defStmt();
            case "ON": return onStmt();
            case "POKE": { const a = expr(); expect(44); return pokeMem(a, expr()); }
            case "INPUT": return inputStmt();
            case "GET": return getStmt();
            case "RUN": { const n = isDigit(peek()) ? lineNumber() : undefined; return startRun(n); }
            case "LIST": return listStmt();
            case "NEW": prog.clear(); reindex(); clearVars(); contState = null; return endProgram();
            case "CLR": clearVars(); return;
            case "CONT": {
                if (!contState) throw err("CAN'T CONTINUE");
                const s = contState;
                contState = null;
                setPos(s.idx, s.pos);
                needSep = s.needSep;
                return;
            }
            case "SAVE": return saveStmt();
            case "LOAD": return loadStmt();
            case "VERIFY": skipStatement(); if (cx) newline(); out("OK"); newline(); return;
            case "WAIT": case "SYS": case "OPEN": case "CLOSE": case "CMD": case "PRINT#": case "INPUT#":
                throw err("DEVICE NOT PRESENT");
        }
        throw err("SYNTAX");
    }

    function letStmt() {
        const r = ref();
        expect(61);
        assign(r, expr());
    }

    function printStmt() {
        let trailing = false;
        for (;;) {
            const c = peek();
            if (c < 0 || c === 58) { if (!trailing) newline(); return; }
            trailing = false;
            if (c === 59) { P.pos++; trailing = true; continue; }
            if (c === 44) {
                P.pos++;
                const n = (Math.floor(cx / 10) + 1) * 10 - cx;
                out(" ".repeat(n));
                trailing = true;
                continue;
            }
            if (c === T["TAB("] || c === T["SPC("]) {
                P.pos++;
                const n = Math.floor(num(expr()));
                expect(41);
                if (n < 0 || n > 255) throw err("ILLEGAL QUANTITY");
                const col = cx + (link[cy] ? COLS : 0);
                out(" ".repeat(c === T["SPC("] ? n : Math.max(0, n - col)));
                trailing = true;
                continue;
            }
            const v = expr();
            out(typeof v === "number" ? numStr(v) + " " : v);
        }
    }

    function forStmt() {
        const n = varName();
        if (isStrName(n) || n.endsWith("%")) throw err("TYPE MISMATCH");
        expect(61);
        const start = num(expr());
        expect(T.TO);
        const limit = num(expr());
        const stp = accept(T.STEP) ? num(expr()) : 1;
        vars.set(n, start);
        const i = forStack.findIndex((f) => f.n === n);
        if (i >= 0) forStack.length = i;
        if (forStack.length > 100) throw err("OUT OF MEMORY");
        forStack.push({ n, limit, stp, idx: curIdx, pos: P.pos, text: P.text });
    }
    function nextStmt() {
        const names = [];
        if (!atEnd()) do names.push(varName()); while (accept(44));
        let k = 0;
        do {
            let i;
            if (names.length) {
                i = forStack.map((f) => f.n).lastIndexOf(names[k]);
            } else i = forStack.length - 1;
            if (i < 0) throw err("NEXT WITHOUT FOR");
            forStack.length = i + 1;
            const f = forStack[i];
            const v = checkNum(getVar(f.n) + f.stp);
            vars.set(f.n, v);
            if (f.stp >= 0 ? v <= f.limit : v >= f.limit) {
                curIdx = f.idx;
                P = { text: f.text, pos: f.pos };
                return;
            }
            forStack.length = i;
            k++;
        } while (k < names.length);
    }

    function dimStmt() {
        do {
            const n = varName();
            expect(40);
            const dims = [];
            do dims.push(int16(expr())); while (accept(44));
            expect(41);
            if (arrays.has(n)) throw err("REDIM'D ARRAY");
            makeArray(n, dims);
        } while (accept(44));
    }
    function defStmt() {
        if (curIdx < 0) throw err("ILLEGAL DIRECT");
        expect(T.FN);
        const n = varName();
        expect(40);
        const param = varName();
        expect(41);
        expect(61);
        fns.set(n, { param, text: P.text, pos: P.pos });
        skipStatement();
    }
    function onStmt() {
        const v = Math.floor(num(expr()));
        if (v < 0 || v > 255) throw err("ILLEGAL QUANTITY");
        const sub = accept(T.GOSUB);
        if (!sub) expect(T.GOTO);
        const targets = [];
        do targets.push(lineNumber()); while (accept(44));
        if (v < 1 || v > targets.length) return;
        if (sub) gosubStack.push({ idx: curIdx, pos: P.pos, text: P.text });
        gotoLine(targets[v - 1]);
    }

    function nextDatum() {
        for (;;) {
            if (data.inData) break;
            if (data.idx >= lines.length) throw err("OUT OF DATA");
            const t = prog.get(lines[data.idx]);
            let inQ = false;
            while (data.pos < t.length) {
                const c = t.charCodeAt(data.pos++);
                if (c === 34) inQ = !inQ;
                else if (!inQ && c === T.REM) { data.pos = t.length; break; }
                else if (!inQ && c === T.DATA) { data.inData = true; break; }
            }
            if (!data.inData) { data.idx++; data.pos = 0; }
        }
        const t = prog.get(lines[data.idx]);
        while (data.pos < t.length && t.charCodeAt(data.pos) === 32) data.pos++;
        let s = "", quoted = false;
        if (t.charCodeAt(data.pos) === 34) {
            quoted = true;
            data.pos++;
            while (data.pos < t.length && t.charCodeAt(data.pos) !== 34) s += t[data.pos++];
            data.pos++;
        }
        while (data.pos < t.length && t.charCodeAt(data.pos) !== 44 && t.charCodeAt(data.pos) !== 58) {
            if (!quoted) s += t[data.pos];
            data.pos++;
        }
        if (t.charCodeAt(data.pos) === 44) data.pos++;
        else data.inData = false;
        return { s: quoted ? s : s.trim(), line: lines[data.idx] };
    }
    const NUMRE = /^[+-]?(\d+\.?\d*|\.\d*)(E[+-]?\d+)?$/;
    function assignFromData(r) {
        const d = nextDatum();
        if (isStrName(r.n)) return assign(r, d.s);
        const t = d.s.replace(/ /g, "");
        if (t !== "" && !NUMRE.test(t)) throw err("SYNTAX");
        assign(r, t === "" || t === "." ? 0 : parseFloat(t));
    }

    function inputStmt() {
        if (curIdx < 0) throw err("ILLEGAL DIRECT");
        if (peek() === 34) { const s = stringLiteral(); expect(59); out(s); }
        const varsPos = P.pos;
        skipStatement();
        inputState = { varsPos, startPos: varsPos, stmtEnd: P.pos };
        P.pos = varsPos;
        promptInput("? ");
    }
    function promptInput(p) {
        out(p);
        inputX = cx;
        inputY = cy;
        mode = "input";
    }
    function splitInput(text) {
        const items = [];
        let cur = "", inQ = false, quoted = false;
        for (const ch of text) {
            if (ch === '"') { inQ = !inQ; quoted = true; continue; }
            if (ch === "," && !inQ) { items.push(quoted ? cur : cur.trim()); cur = ""; quoted = false; continue; }
            cur += ch;
        }
        items.push(quoted ? cur : cur.trim());
        return items;
    }
    function finishInput(text) {
        if (text.trim() === "" && P.pos === inputState.startPos) { // empty answer ends the program
            P.pos = inputState.stmtEnd;
            saveCont();
            endProgram();
            return;
        }
        const items = splitInput(text);
        let i = 0;
        P.pos = inputState.varsPos;
        for (;;) {
            if (i >= items.length) { // not enough answers: ask again for the rest
                inputState.varsPos = P.pos;
                promptInput("?? ");
                return;
            }
            const r = ref();
            const item = items[i++];
            if (isStrName(r.n)) assign(r, item);
            else {
                const t = item.replace(/ /g, "");
                if (t !== "" && !NUMRE.test(t)) {
                    out("?REDO FROM START");
                    newline();
                    inputState.varsPos = inputState.startPos;
                    P.pos = inputState.startPos;
                    promptInput("? ");
                    return;
                }
                assign(r, t === "" || t === "." ? 0 : parseFloat(t));
            }
            if (!accept(44)) break;
        }
        if (i < items.length) { out("?EXTRA IGNORED"); newline(); }
        P.pos = inputState.stmtEnd;
        needSep = true;
        mode = "run";
    }

    function getStmt() {
        if (curIdx < 0) throw err("ILLEGAL DIRECT");
        do {
            const r = ref();
            const k = keyBuf.length ? keyBuf.shift() : -1;
            if (isStrName(r.n)) assign(r, k < 0 ? "" : String.fromCharCode(k));
            else if (k < 0) assign(r, 0);
            else if (isDigit(k)) assign(r, k - 48);
            else throw err("SYNTAX");
        } while (accept(44));
    }

    function listChar(c, inQ) {
        if (inQ && (c < 32 || (c >= 128 && c < 160))) putScreen((c < 32 ? c : c - 64) | 128);
        else printPet(c);
    }
    function listStmt() {
        let a = 0, b = 63999;
        if (isDigit(peek())) {
            a = lineNumber();
            if (accept(45)) b = isDigit(peek()) ? lineNumber() : 63999; else b = a;
        } else if (accept(45)) b = lineNumber();
        for (const n of lines) {
            if (n < a || n > b) continue;
            out(String(n) + " ");
            const t = prog.get(n);
            let inQ = false;
            for (let i = 0; i < t.length; i++) {
                const c = t.charCodeAt(i);
                if (c >= 256) out(KW[c - 256]);
                else { if (c === 34) inQ = !inQ; listChar(c, inQ); }
            }
            newline();
        }
        endProgram();
    }

    // SAVE "NAME" / LOAD "NAME" / LOAD "$": programs are kept in this browser.
    const STORE = "computer-room-basic:";
    function fileName() {
        if (atEnd()) throw err("MISSING FILE NAME");
        const n = str(expr());
        while (!atEnd()) P.pos++; // ignore ,8 and similar device numbers
        if (!n) throw err("MISSING FILE NAME");
        return n;
    }
    function storage() {
        try { return window.localStorage; } catch (e) { return null; }
    }
    function saveStmt() {
        const n = fileName(), st = storage();
        if (cx) newline();
        out("SAVING " + n);
        newline();
        try { st.setItem(STORE + toText(n), exportProgram()); } catch (e) { throw err("DEVICE NOT PRESENT"); }
    }
    function loadStmt() {
        const n = fileName(), st = storage();
        if (!st) throw err("DEVICE NOT PRESENT");
        if (cx) newline();
        if (n === "$") {
            out('0 "COMPUTER ROOM"');
            newline();
            for (let i = 0; i < st.length; i++) {
                const k = st.key(i);
                if (!k.startsWith(STORE)) continue;
                const size = Math.ceil(st.getItem(k).length / 254);
                out(String(size).padEnd(5) + '"' + fromText(k.slice(STORE.length)) + '"');
                newline();
            }
            return endProgram();
        }
        out("SEARCHING FOR " + n);
        newline();
        const text = st.getItem(STORE + toText(n));
        if (text === null) throw err("FILE NOT FOUND");
        out("LOADING");
        newline();
        loadText(text);
        endProgram();
    }

    // ------------------------------------------------------------------ line entry
    function storeLine(petText) {
        const t = crunch(petText);
        let i = 0;
        while (i < t.length && t.charCodeAt(i) === 32) i++;
        if (!isDigit(t.charCodeAt(i))) return false;
        let n = 0;
        while (i < t.length && (isDigit(t.charCodeAt(i)) || t.charCodeAt(i) === 32)) {
            if (t.charCodeAt(i) !== 32) n = n * 10 + t.charCodeAt(i) - 48;
            i++;
            if (n > 63999) throw err("SYNTAX");
        }
        const body = t.slice(i);
        if (body.trim() === "") prog.delete(n); else prog.set(n, body);
        reindex();
        return true;
    }
    function enterLine(petText) {
        try {
            if (storeLine(petText)) { clearVars(); contState = null; return; }
            const t = crunch(petText).replace(/^ +/, "");
            if (!t) return;
            directText = t;
            setPos(-1, 0);
            needSep = false;
            mode = "run";
        } catch (e) { handleError(e); }
    }
    function loadText(text) {
        prog.clear();
        text.split(/\r?\n/).forEach((l) => { if (l.trim()) storeLine(fromText(l)); });
        reindex();
        clearVars();
        contState = null;
    }

    function handleError(e) {
        let msg;
        if (e instanceof BasicError) msg = e.message;
        else if (e instanceof RangeError) msg = "OUT OF MEMORY";
        else { console.error(e); msg = "INTERNAL"; }
        if (cx) newline();
        out("?" + msg + "  ERROR" + (mode === "run" && curIdx >= 0 ? " IN " + lines[curIdx] : ""));
        contState = null;
        ready();
    }

    function readLogicalLine(fromInput) {
        const s = lineStart(cy);
        let skip = 0;
        if (fromInput && lineStart(Math.max(0, inputY)) === s && inputY >= 0) skip = (inputY - s) * COLS + inputX;
        let t = "";
        lineCells(s).slice(skip).forEach((i) => (t += String.fromCharCode(screenToPet(screen[i]))));
        cy = s + lineRows(s) - 1;
        newline();
        return t.replace(/ +$/, "");
    }

    // ------------------------------------------------------------------ keyboard
    function keyToPet(e) {
        const k = e.key;
        switch (k) {
            case "Enter": return 13;
            case "ArrowUp": return 145;
            case "ArrowDown": return 17;
            case "ArrowLeft": return 157;
            case "ArrowRight": return 29;
            case "Home": return e.shiftKey ? 147 : 19;
            case "Backspace": return e.shiftKey ? 148 : 20;
            case "Insert": return 148;
        }
        if (k.length !== 1) return -1;
        if (UNI[k]) return UNI[k];
        let c = k.charCodeAt(0);
        if (c >= 97 && c <= 122) return e.shiftKey ? c - 97 + 193 : c - 32;
        if (c >= 65 && c <= 90) return e.shiftKey ? c - 65 + 193 : c;
        if (c === 94) return 94;
        if (c === 95) return 95;
        if (c >= 32 && c <= 93) return c;
        return -1;
    }
    let blink = 0;
    function onKey(e) {
        if (e.target && e.target.closest && e.target.closest("#help")) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && mode !== "edit") {
            e.preventDefault(); breakProgram(); return;
        }
        if (e.ctrlKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); if (mode !== "run") clearScreen(); return; }
        if (e.metaKey || (e.ctrlKey && !e.altKey)) return; // leave copy/paste/reload to the browser (AltGr = ctrl+alt)
        if (e.key === "Escape") { e.preventDefault(); breakProgram(); return; }
        const c = keyToPet(e);
        if (c < 0) return;
        e.preventDefault();
        blink = 0;
        if (mode === "run") { if (keyBuf.length < 10) keyBuf.push(c); return; }
        if (c === 13) {
            const fromInput = mode === "input";
            const t = readLogicalLine(fromInput);
            if (fromInput) {
                try { finishInput(t); } catch (er) { mode = "run"; handleError(er); }
            } else enterLine(t);
            return;
        }
        if (c === 20) return deleteChar();
        if (c === 148) return insertChar();
        if (c === 157) return cursorLeft();
        if (c === 29) return cursorRight();
        if (c === 17) return cursorDown();
        if (c === 145) return cursorUp();
        if (c === 19) { cx = cy = 0; return; }
        if (c === 147) return clearScreen();
        const s = petToScreen(c);
        if (s >= 0) typeChar(s);
    }

    // Pasted text is typed in line by line (stored lines go in silently fast).
    const pasteQueue = [];
    function pasteText(text) {
        text.split(/\r?\n/).forEach((l) => pasteQueue.push(fromText(l)));
        if (pasteQueue.length && pasteQueue[pasteQueue.length - 1] === "") pasteQueue.pop();
    }
    function feedPaste() {
        let n = 0;
        while (mode === "edit" && pasteQueue.length && n++ < 40) {
            const l = pasteQueue.shift();
            for (let i = 0; i < l.length; i++) {
                const s = petToScreen(l.charCodeAt(i));
                if (s >= 0) putScreen(s);
            }
            newline();
            enterLine(l);
        }
    }

    // ------------------------------------------------------------------ display
    let canvas, ctx, img, pix, fg, bg;
    function setColors(name) {
        const c = PHOSPHOR[name] || PHOSPHOR.white;
        fg = 0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0];
        bg = 0xff000000;
    }
    function render() {
        const set = lower ? GLYPHS.lower : GLYPHS.upper;
        const showCursor = mode !== "run" && !pasteQueue.length && blink % 40 < 20;
        const cur = cy * COLS + cx;
        for (let r = 0; r < ROWS; r++) {
            for (let col = 0; col < COLS; col++) {
                const i = r * COLS + col;
                let code = screen[i], inv = code & 128 ? 255 : 0;
                if (showCursor && i === cur) inv ^= 255;
                const g = set[code & 127];
                let p = r * 8 * 320 + col * 8;
                for (let y = 0; y < 8; y++, p += 320) {
                    const bits = g[y] ^ inv;
                    for (let x = 0; x < 8; x++) pix[p + x] = bits & (128 >> x) ? fg : bg;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
    }
    function tick() {
        blink++;
        if (mode === "edit" && pasteQueue.length) feedPaste();
        if (mode === "run") {
            try {
                for (let i = 0; i < SPEED && mode === "run"; i++) step();
            } catch (e) { handleError(e); }
        }
        render();
        requestAnimationFrame(tick);
    }

    // ------------------------------------------------------------------ links
    function encode(text) {
        const bytes = new TextEncoder().encode(text);
        let bin = "";
        bytes.forEach((b) => (bin += String.fromCharCode(b)));
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function decode(s) {
        const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
        return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
    function shareLink() {
        return location.origin + location.pathname + "#p=" + encode(exportProgram());
    }

    function start(cv) {
        canvas = cv;
        canvas.width = 320;
        canvas.height = 200;
        ctx = canvas.getContext("2d");
        img = ctx.createImageData(320, 200);
        pix = new Uint32Array(img.data.buffer);
        setColors(params.get("phosphor"));
        document.addEventListener("keydown", onKey);
        document.addEventListener("paste", (e) => {
            if (e.target && e.target.closest && e.target.closest("#help")) return;
            e.preventDefault();
            if (mode === "edit") pasteText(e.clipboardData.getData("text"));
        });
        out(" ### COMPUTER ROOM BASIC ###");
        newline(); newline();
        out(" " + bytesFree() + " BYTES FREE");
        newline();
        const m = /^#([pr])=(.+)$/.exec(location.hash);
        if (m) {
            try {
                loadText(decode(m[2]));
                if (m[1] === "r") { out("READY."); newline(); out("RUN"); newline(); startRun(); }
                else { directText = TCH("LIST"); setPos(-1, 0); mode = "run"; }
            } catch (e) { handleError(e); }
        } else ready();
        requestAnimationFrame(tick);
    }

    return {
        start,
        shareLink,
        exportProgram,
        isEditing: () => mode === "edit",
        loadFile(text) {
            if (mode !== "edit") breakProgram();
            try { loadText(text); out("LOADED"); newline(); ready(); } catch (e) { handleError(e); }
        },
        type(text) { if (mode === "edit") pasteText(text); },
        screenText() { // for testing: the screen as plain text, one row per line
            const rows = [];
            for (let r = 0; r < ROWS; r++) {
                let s = "";
                for (let x = 0; x < COLS; x++) s += toText(String.fromCharCode(screenToPet(screen[r * COLS + x])));
                rows.push(s.replace(/ +$/, ""));
            }
            return rows.join("\n");
        },
        mode: () => mode,
    };
})();
