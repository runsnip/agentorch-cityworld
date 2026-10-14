# AgentOrch · Thành phố sống (Living City)

A free add-on for [AgentOrch](https://github.com/runsnip/agentorch): the city around your company's office
comes to life.

- detailed 3D trees around you
- people walking the sidewalks, cars driving their lanes (they stop for you), and cars you can drive (F)
- a new set of city missions every day, chests under light beams around town
- the company's **Inventory** (Tab › Kho đồ): items by rarity, usable in AgentOrch's games

Install it from the app: **Tab › Giải trí › Thành phố sống › Tải về**. Rewards are decided by the app
itself (against the official repository) and kept in its encrypted vault; this add-on only shows them.

## Development

The add-on is plain ES modules loaded by the office world through its add-on host
(`extras.host` in AgentOrch's `agentorch/web/world.js`); `manifest.json` says which host API it needs.

    python3 tools/pack.py                       # dist/city.zip + .sha256
    AGENTORCH_CITY_URL=file://$PWD/dist/city.zip python -m agentorch   # install your build from the app

Or symlink this folder to `~/.agentorch/addons/city`. A release is a tag `v<version>` matching
`manifest.json`; the workflow attaches the pack to the GitHub release.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
