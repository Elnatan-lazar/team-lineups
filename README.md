# ⚽ Team Lineups · סידור הרכבים

A small web app for managing a 7-a-side football team: build several lineups per game, track who started or came off the bench, and record post-game stats.

**Live site:** https://elnatan-lazar.github.io/team-lineups/

## Features

- **Squad**: players with full name, shirt name, number, foreign-player tag and a fixed goalkeeper who is placed in goal automatically.
- **Games**: opponent, date, and attendance (who is coming).
- **Several lineups per game**, shown side by side, with 4 formations (3-2-1, 2-3-1, 3-1-2, 2-2-2).
- **Subs bench** for each lineup (the "second option").
- **Per-game warnings**: attending players who never start, players not used at all, incomplete lineups.
- **Post-game stats**: score, goals, assists, yellow/red cards, MVP.
- **Season table**: games, starts, sub appearances, goals, assists, cards and MVP per player. You can sort by any column.
- **Sharing**: copy lineups as WhatsApp-ready text, send them straight to WhatsApp, or save/share a PNG image of one lineup or of a whole game.

## Data

Everything is stored locally in the browser (`localStorage`) and saved automatically. Use **Squad → Export backup** to download a JSON file, and **Import backup** to restore it on another device.

## Tech

Plain HTML, CSS and JavaScript with no build step and no dependencies. Lineup images are drawn on a `<canvas>`. Hosted on GitHub Pages.

```
index.html   page shell
style.css    styles (RTL, responsive)
app.js       state, views, lineup editor, stats, image export
```

Run locally by opening `index.html` in a browser.
