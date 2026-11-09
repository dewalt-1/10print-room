// Character sets for the 40x25 screen, indexed by screen code 0-127
// (bit 7 of a screen cell = reversed). Letters, digits and punctuation come
// from ASCII_FONT (font.js); the graphic characters are drawn here.

const GLYPHS = (function () {
    const blank = () => [0, 0, 0, 0, 0, 0, 0, 0];
    const pat = (rows) => rows.map((r) => {
        let v = 0;
        for (let i = 0; i < 8; i++) if (r[i] === "#") v |= 128 >> i;
        return v;
    });
    const fill = (x0, y0, x1, y1) => {
        const g = blank();
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y] |= 128 >> x;
        return g;
    };
    const or = (...gs) => {
        const g = blank();
        gs.forEach((h) => h.forEach((v, i) => (g[i] |= v)));
        return g;
    };
    const flipH = (g) => g.map((v) => {
        let r = 0;
        for (let i = 0; i < 8; i++) if (v & (1 << i)) r |= 128 >> i;
        return r;
    });
    const flipV = (g) => g.slice().reverse();
    const H = (y) => fill(0, y, 7, y + 1); // 2-pixel horizontal line
    const V = (x) => fill(x, 0, x + 1, 7); // 2-pixel vertical line

    const diag = blank(); // ╲, three pixels wide so the maze joins up
    for (let y = 0; y < 8; y++) for (let x = y - 1; x <= y + 1; x++) if (x >= 0 && x < 8) diag[y] |= 128 >> x;

    const arcRD = pat([ // ╭
        "........", "........", "........",
        ".....###", "....####", "...###..", "...##...", "...##...",
    ]);
    const arcLD = flipH(arcRD); // ╮
    const arcUR = flipV(arcRD); // ╰
    const arcUL = flipH(arcUR); // ╯

    const checker = blank();
    for (let y = 0; y < 8; y++) checker[y] = (y >> 1) & 1 ? 0x33 : 0xcc;

    const triUR = blank(), triUL = blank();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        if (x >= y) triUR[y] |= 128 >> x;
        if (x <= 7 - y) triUL[y] |= 128 >> x;
    }

    const G = {};
    G[64] = H(3);
    G[65] = pat(["...##...", "..####..", ".######.", "########", "########", ".#.##.#.", "...##...", "..####.."]); // spade
    G[66] = V(3);
    G[67] = H(2);
    G[68] = H(1);
    G[69] = H(5);
    G[70] = H(4);
    G[71] = V(2);
    G[72] = V(4);
    G[73] = arcLD;
    G[74] = arcUR;
    G[75] = arcUL;
    G[76] = or(fill(0, 0, 1, 7), fill(0, 6, 7, 7));
    G[77] = diag;
    G[78] = flipH(diag);
    G[79] = or(fill(0, 0, 7, 1), fill(0, 0, 1, 7));
    G[80] = or(fill(0, 0, 7, 1), fill(6, 0, 7, 7));
    G[81] = pat(["........", "..####..", ".######.", ".######.", ".######.", ".######.", "..####..", "........"]); // ball
    G[82] = H(6);
    G[83] = pat(["........", ".##..##.", "########", "########", ".######.", "..####..", "...##...", "........"]); // heart
    G[84] = V(1);
    G[85] = arcRD;
    G[86] = or(diag, flipH(diag));
    G[87] = pat(["........", "..####..", ".##..##.", ".#....#.", ".#....#.", ".##..##.", "..####..", "........"]); // circle
    G[88] = pat(["...##...", "..####..", "..####..", "##.##.##", "########", "##.##.##", "...##...", "..####.."]); // club
    G[89] = V(5);
    G[90] = pat(["...##...", "..####..", ".######.", "########", ".######.", "..####..", "...##...", "........"]); // diamond
    G[91] = or(H(3), V(3));
    G[92] = checker.map((v) => v & 0xf0);
    G[93] = V(3);
    G[94] = pat(["........", "........", "########", ".##..##.", ".##..##.", ".##..##.", ".##..##.", "........"]); // pi
    G[95] = triUR;
    G[96] = blank();
    G[97] = fill(0, 0, 3, 7);
    G[98] = fill(0, 4, 7, 7);
    G[99] = fill(0, 0, 7, 0);
    G[100] = fill(0, 7, 7, 7);
    G[101] = fill(0, 0, 0, 7);
    G[102] = checker;
    G[103] = fill(7, 0, 7, 7);
    G[104] = checker.map((v, y) => (y >= 4 ? v : 0));
    G[105] = triUL;
    G[106] = fill(6, 0, 7, 7);
    G[107] = or(V(3), fill(3, 3, 7, 4));
    G[108] = fill(4, 4, 7, 7);
    G[109] = or(fill(3, 0, 4, 4), fill(3, 3, 7, 4));
    G[110] = or(fill(0, 3, 4, 4), fill(3, 3, 4, 7));
    G[111] = fill(0, 6, 7, 7);
    G[112] = or(fill(3, 3, 7, 4), fill(3, 3, 4, 7));
    G[113] = or(H(3), fill(3, 0, 4, 4));
    G[114] = or(H(3), fill(3, 3, 4, 7));
    G[115] = or(V(3), fill(0, 3, 4, 4));
    G[116] = fill(0, 0, 1, 7);
    G[117] = fill(0, 0, 2, 7);
    G[118] = fill(5, 0, 7, 7);
    G[119] = fill(0, 0, 7, 1);
    G[120] = fill(0, 0, 7, 2);
    G[121] = fill(0, 5, 7, 7);
    G[122] = or(fill(6, 0, 7, 7), fill(0, 6, 7, 7));
    G[123] = fill(0, 4, 3, 7);
    G[124] = fill(4, 0, 7, 3);
    G[125] = or(fill(0, 3, 4, 4), fill(3, 0, 4, 4));
    G[126] = fill(0, 0, 3, 3);
    G[127] = or(fill(0, 0, 3, 3), fill(4, 4, 7, 7));

    const arrowUp = pat(["...##...", "..####..", ".######.", "...##...", "...##...", "...##...", "...##...", "........"]);
    const arrowLeft = pat(["........", "...#....", "..##....", ".#######", ".#######", "..##....", "...#....", "........"]);

    function build(lower) {
        const set = [];
        for (let s = 0; s < 128; s++) {
            let g;
            if (s === 30) g = arrowUp;
            else if (s === 31) g = arrowLeft;
            else if (s === 0) g = ASCII_FONT[64];
            else if (s <= 26) g = ASCII_FONT[(lower ? 96 : 64) + s];
            else if (s < 32) g = ASCII_FONT[[91, 92, 93][s - 27]];
            else if (s < 64) g = ASCII_FONT[s];
            else if (lower && s >= 65 && s <= 90) g = ASCII_FONT[s];
            else g = G[s];
            set.push(Uint8Array.from(g));
        }
        return set;
    }

    return { upper: build(false), lower: build(true) };
})();
