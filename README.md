# Tense table

A small browser game for learning the 3×3 table of English tenses by heart:
future, present and past against question, statement and negation.
The interface is in Russian and looks like a squared school notebook.

Play: https://evilork.github.io/tense-table/

## What is inside

- Eight lessons: find the cell, pick the translation, build it from word tiles,
  type it, regular verbs, irregular verbs, a 90-second blitz and a final test
  without hints.
- Mistakes come back a few questions later; a grade of 3 opens the next lesson.
- Every cell of the table shows how firmly it is learned; the blitz asks the
  weak cells more often.
- Works on a phone: the keyboard stays open between questions, the Back button
  returns to the table, and the game can be added to the home screen and
  played offline.
- Progress is stored in the browser only (`localStorage`). No accounts, no
  tracking, no server.

## Files

| File | Purpose |
| --- | --- |
| `engine.js` | Pure logic: phrases, answer checks, lesson plans, grades |
| `app.js` | Screens, input, sound, saved progress |
| `style.css` | The notebook |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline play and home-screen install |
| `engine.test.js` | Unit tests for the engine |
| `build.js` | Packs the game into one self-contained HTML file |
| `tools/make-icons.js` | Draws the icons |

There is no build step for the site itself: the files are served as they are.

## Development

```sh
python3 -m http.server 8765   # then open http://localhost:8765
npm test                      # engine tests, needs Node 18+
npm run build                 # single-file version: tablica-vremen.html
npm run icons                 # redraw the icons
```
