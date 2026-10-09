pragma circom 2.1.6;

include "../lib/solvency_tree.circom";

// Small circuit for fast local iteration and CI smoke tests.
// DEPTH = 2 -> 4 holders. Compiles and proves in seconds.
component main = SolvencyTree(2, 64);
