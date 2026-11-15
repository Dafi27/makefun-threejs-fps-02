# EMBER YARD — a three.js tactical FPS

Entry for the make.fun bounty **threejs-fps-02** — "Make the best three.js
tactical FPS" ($1,000 in USDC, round 2).

- Owner: [Dafi27](https://make.fun/u/dafi27)
- Repo: `makefun-threejs-fps-02`
- Referral code: `tm9bafze`
- Stack: three.js 0.187.0 (vendored, no build step, ES modules), Node.js 22+

## The game

A round-based tactical shooter in the spirit of Counter-Strike, with an
original map, art, and names. Ember (attackers, orange) vs Ash (defenders,
teal) fight 4v4 across an industrial yard at dusk: site A "Silo" in the
north-east, site B "Crane" in the north-west, linked by A-long, B-long, mid,
and connector lanes.

- **Rounds:** 12 s buy phase, 100 s round, first to 5 (max 9 rounds).
  Win by eliminating the enemy team, planting the bomb and letting it
  detonate, or (as defenders) defusing it or running the clock out.
- **Objective:** the bomb carrier plants at A or B (3 s plant, 5 s defuse,
  35 s bomb timer). Planting and defusing pay $300.
- **Economy:** start $800, kill +$300, win +$3,250, loss +$1,900
  (+$500 per consecutive loss), max $16,000. Buy menu (B) between rounds.
- **Arsenal:** P9 pistol (free), AR-77 rifle $2,700, VK-9 SMG $1,500,
  M12 shotgun $1,700, LR-50 sniper $4,750, frag grenade $300,
  Kevlar vest $650 (+100 armour). Headshots pay off: x4 rifle/SMG/pistol,
  x2 sniper/shotgun.
- **Gunplay:** hitscan raycasts, recoil and spread that punish firing on
  the move, crouching and ADS tighten the spread, acceleration and air
  control, collision with the map, armour absorbing 50%.
- **Bots:** 3 friendly + 4 enemy bots with route/hold/engage/plant/defuse
  states, BFS routing over a 17-node waypoint graph, line-of-sight + field
  of view vision, reaction times, burst fire with real raycasts, and
  hearing (gunshots within 25 m draw them in).
- **Tech:** fixed-step 1/60 simulation separated from rendering, pooled
  tracers, no per-frame allocations in the hot loops, all game state in one
  place, procedural WebAudio sound (no audio files).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire |
| 1–5 | Weapons |
| R | Reload |
| G | Throw grenade |
| E | Plant / defuse |
| Ctrl | Crouch |
| Shift | Walk slow |
| Space | Jump |
| B | Buy menu |
| Esc | Pause |

Arrow keys turn without a mouse, so the game is usable headless too.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in a desktop browser with WebGL 2 and click
to play. No build step, no network calls at runtime — everything is local,
including the vendored three.js.

## Screenshots

The four images in `screenshots/` are real renders of this game's own code,
captured in headless Chromium with WebGL 2 via `?shot=<name>&seed=1`:

1. `1-start.jpg` — title screen
2. `2-play.jpg` — mid-round firefight (AR-77 headshot kill, kill feed)
3. `3-buy.jpg` — buy menu during the buy phase
4. `4-end.jpg` — round-won screen

## Build the dossier

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` via `buildDossier` from the kit's
`vendor/makefun-threejs.ts` (unchanged from the kit).

## License

MIT — see `LICENSE`. three.js is vendored under its own MIT license in
`game/vendor/three/LICENSE`.
