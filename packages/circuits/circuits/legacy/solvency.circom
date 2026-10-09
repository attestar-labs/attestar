pragma circom 2.1.6;

include "../lib/solvency_tree.circom";

// Demo / production circuit.
// DEPTH = 10 -> up to 1024 holders. BITS = 64 -> balances up to ~1.8e19 base units.
// Adjust DEPTH to trade holder capacity against proving cost.
component main = SolvencyTree(10, 64);
