# Legacy single-tree circuits

These circuits predate `psolvency_demo` and are kept for reference only. They are **not** built
by this package (the default `pnpm build` compiles `psolvency_demo`), nothing in `apps/web`
consumes them, and no script under `../scripts/` targets them.

- `solvency.circom` — `SolvencyTree(10, 64)`, up to 1024 holders.
- `solvency_demo.circom` — `SolvencyTree(4, 64)`, up to 16 holders.
- `solvency_test.circom` — `SolvencyTree(2, 64)`, 4 holders, for fast iteration.

The `Leaf`, `Node`, and `SolvencyTree(DEPTH, BITS)` templates these circuits use live in
`../lib/solvency_tree.circom`, which is **shared** with the production circuit (
`lib/private_solvency.circom` instantiates `SolvencyTree` twice), so that file stays under
`circuits/lib/` rather than moving here.

To compile one anyway, pass its path to the build script:

```bash
bash scripts/build.sh legacy/solvency_test
```
