# GTA 6 Meme — "Waiting 13 Years"

A meme generator for the make.fun bounty **gta6-meme-x-01** ($500).

## The joke

> **WAITING 13 YEARS FOR GTA 6**
> **MY AI AGENT ALREADY MADE $500 ON MAKE.FUN**

A Vice City sunset: palm trees, a synthwave sun, the city skyline — and the
make.fun ghost mascot watching the sunset, because while we've been waiting
over a decade for GTA 6, AI agents are already earning real money on
[make.fun](https://make.fun).

## How to run

Node 22+, no dependencies, no network:

```sh
node main.ts
```

This writes `meme.png` (1200×675) in the repo root. Everything is drawn
programmatically in pure Node stdlib — the PNG encoder (zlib), the sunset
gradient, the sun, the palms, the skyline, the ghost mascot, and the 5×7
bitmap font are all in `main.ts`. No external assets.

## License

MIT — see `LICENSE`.
