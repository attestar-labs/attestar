pragma circom 2.1.6;

include "../lib/solvency_tree.circom";

// Demo circuit for the web app: DEPTH = 4 -> up to 16 holders.
// Small enough to prove in a second or two server-side, large enough to look real.
component main = SolvencyTree(4, 64);
