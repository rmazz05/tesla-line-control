import { runBenchmark } from "../src/lib/priority/engine";

console.log("Synthetic 40-minute scenario; identical events, buffers and maintenance always available.");
console.log("Decision rule: people, uncontained consequences, unknowns, then production repair windows.");
console.table(runBenchmark());
console.log("Unlimited maintenance can make different dispatch orders equivalent; these results do not prove an optimal ranking.");
console.log("Results describe this authored simulator and are not validated factory savings.");
