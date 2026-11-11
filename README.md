# ⚽ Team Lineups · סידור הרכבים

A web app for managing a 7-a-side football team. It is organised in rounds: each round has one attendance list and several games, and each game has its own lineup, subs, result and player stats.

**Live site:** https://elnatan-lazar.github.io/team-lineups/

## Features

- **Squad**: full name, shirt name, number, foreign-player tag and a fixed goalkeeper who is placed in goal automatically.
- **Rounds (מחזורים)**: mark who is coming for the whole round, then add as many games as you need.
- **Games**: one lineup per game with a subs bench ("second option"). Games are shown side by side, and there are 4 formations (3-2-1, 2-3-1, 3-1-2, 2-2-2).
- **Round warnings**: shows attending players who didn't start any game, players not used at all, and incomplete lineups. While you edit, the editor shows how many times each player has already started in the round.
- **After the game**: score, goals, assists, yellow/red cards and MVP for each game.
- **Season table**: rounds attended, games played, starts, sub appearances, goals, assists, cards and MVP. You can sort by any column.
- **Sharing**: WhatsApp-ready text, a direct WhatsApp link, and a PNG image of one game or of a whole round.
- **Phone friendly**: bottom navigation, large tap targets, and lineups you swipe between.
- **Cloud sync (optional)**: data lives in Firebase Firestore and updates live on every device. Anyone with the link can view; only approved Google accounts can edit.

## Cloud database setup (one time, free)

Until this is done the app works but saves only in the current browser.

1. Go to https://console.firebase.google.com → **Add project** (Google Analytics is not needed).
2. **Build → Firestore Database → Create database**, choose a location (e.g. `eur3`), and start in **production mode**.
3. **Firestore → Rules**: paste the rules below, put your Google email in, and click **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /teams/{teamId} {
         allow read: if true;
         allow write: if request.auth != null
           && request.auth.token.email in ['YOUR_EMAIL@gmail.com'];
       }
     }
   }
   ```
   To give more people edit rights, add their emails to the list. To make the data private, change `allow read: if true` to `allow read: if request.auth != null`.
4. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
5. **Authentication → Settings → Authorized domains → Add domain**: `elnatan-lazar.github.io`.
6. **Project settings (⚙) → General → Your apps → Web (`</>`)**: register an app, then copy the `firebaseConfig` object into `config.js` as `window.FIREBASE_CONFIG = { ... }`.
7. Commit `config.js`, open the site and click **התחבר**. The first sign-in uploads the data from that browser to the cloud.

The values in `config.js` are not secret. Access is controlled by the rules in step 3.

## Data

- With the cloud set up, everything is stored in one Firestore document, `teams/{TEAM_DOC}`, which every device listens to.
- Without the cloud, data is stored in the browser (`localStorage`).
- In both modes, **Squad → Export backup / Import backup** works with a JSON file.

## Tech

Plain HTML, CSS and JavaScript with no build step. Lineup images are drawn on a `<canvas>`. Firebase is loaded from the CDN only when it is configured. Hosted on GitHub Pages.

```
index.html   page shell
style.css    styles (RTL, responsive)
config.js    Firebase config (null = local only)
app.js       state, cloud sync, views, lineup editor, stats, image export
```
