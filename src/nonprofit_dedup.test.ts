import assert from "node:assert/strict";
import { decideDuplicate, nonprofitRecord } from "./nonprofit_dedup.ts";

const record = nonprofitRecord.parse({ id: "volunteer-7", kind: "volunteer_reminder", subject: "Saturday packing shift", body: "Please confirm your 9am shift for the food bank.", campaign: "spring-meals" });
assert.deepEqual(decideDuplicate(record, [{ id: "volunteer-2", score: 0.91 }]), { recordId: "volunteer-7", duplicateOf: "volunteer-2", confidence: 0.91, reason: "semantic match above the review threshold" });
assert.equal(decideDuplicate(record, [{ id: "volunteer-2", score: 0.72 }]).duplicateOf, null);
console.log("business decision test passed");
