# Computer Room: BASIC

A small Commodore-style BASIC in the browser, made for the 10 PRINT exercise in
*Computer Room* (KISD). 40×25 characters, PETSCII-like graphics, a full-screen
editor. Nothing to install, nothing to download, works offline once loaded.

It is **not** an emulator and contains no Commodore code or ROMs. The interpreter,
the screen editor and the graphic characters were written for this course; the
letters come from a public-domain 8×8 font.

```
10 PRINT CHR$(205.5+RND(1));:GOTO 10
RUN
```

## Files

| File | What it is |
|---|---|
| `index.html` | The page: screen, buttons, help. |
| `basic.js` | The BASIC interpreter and screen editor. |
| `glyphs.js` | The graphic characters (╲ ╱ ● ♥ ┌ ─ …), drawn pixel by pixel. |
| `font.js` | Letters and digits: `font8x8_basic` by Daniel Hepper, public domain. |

## Hosting

Plain static files, like `smalltalk-room`: GitHub Pages, Netlify Drop, any web
space. Offline in the classroom: `python3 -m http.server 8000` in this folder,
then open http://localhost:8000.

## Using it

- Type a line with a number to store it, without a number to run it now.
- **Esc** stops a program. **Shift+letter** types graphic characters
  (Shift+M ╲, Shift+N ╱). The arrow keys move anywhere on screen: change a listed
  line and press Return to store it again.
- `SAVE "NAME"` / `LOAD "NAME"` / `LOAD "$"` keep programs in this browser.
- **link** copies a web address that contains the whole program. This is the
  hand-in. **save** downloads a `.bas` text file; **open** or drag-and-drop loads one.
- Cmd/Ctrl+V pastes a program.

### Links

`#p=` opens a program and lists it, `#r=` opens it and runs it. The program is
base64url-encoded plain text after the `#`, so it never reaches the server.
Special characters in text files are written as `{205}` (PETSCII code).

### Options

- `?speed=16` statements per frame (default 16, roughly the pace of a 1 MHz home computer).
- `?phosphor=green` or `amber` instead of white.

## Language

PRINT (`?`), LET, GOTO, GOSUB/RETURN, IF…THEN/GOTO, FOR…TO…STEP/NEXT, ON…GOTO/GOSUB,
INPUT, GET, DIM, READ/DATA/RESTORE, DEF FN, POKE, END, STOP, CONT, REM, RUN, LIST,
NEW, CLR, SAVE, LOAD.
Functions: RND INT ABS SGN SQR SIN COS TAN ATN EXP LOG PEEK LEN STR$ VAL ASC CHR$
LEFT$ RIGHT$ MID$ FRE POS TAB( SPC(. Variables TI and TI$.
Like the originals: only the first two letters of a variable name count, keywords
are found even inside names, and spaces are optional.

Screen memory starts at 32768 (`POKE 32768,81` puts a ball top left; screen
codes, not PETSCII). `POKE 59468,14` switches to lower case, `POKE 59468,12` back.
Control characters in PRINT: `CHR$(147)` clear, `CHR$(19)` home, `CHR$(18)`/`CHR$(146)`
reverse on/off, `CHR$(17)` `CHR$(145)` `CHR$(29)` `CHR$(157)` cursor down/up/right/left.

## Licences

Code: MIT (see `LICENSE`). Font: public domain (font8x8 by Daniel Hepper, from the
public-domain IBM VGA font).
