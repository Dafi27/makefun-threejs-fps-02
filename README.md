# RUST HARBOR — tactical FPS

A round-based tactical first-person shooter in a dusk container terminal,
built on three.js 0.187.0 for make.fun's threejs-fps-02 bounty.

You are a JACKAL: push with your squad, plant the surge charge at site A or
B, and hold it until it blows — or wipe the WARDENS out. Win the round,
earn money, buy better guns. First to 4 rounds takes the match.

## Play

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome:

```sh
python3 -m http.server 8080 --directory game
```

WASD move · Shift walk · C crouch · Mouse aim · Click shoot · R reload ·
B buy · E plant / defuse (hold) · G grenade · Tab score · M mute.

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and
writes `dossier.json` with the kit's `buildDossier`.

## Shots

`shots.json` lists the four staged screenshots under `screenshots/`, taken
with `?shot=start|play|plant|end&seed=1`.

## License

MIT — see `LICENSE`.
