/**
 * İcra Takip Brütten Nete — motor self-tests.
 */
import { calculateInterest, DEPOSIT_INTEREST_BLOKE_MESSAGE } from "./lib/interestCalculator";
import { computeDamgaOnly, computeNetFromGrossSingle, computeStandartBrutNetFromGross, round2 } from "./lib/brutNet";

type Failure = { label: string; actual: unknown; expected: unknown };

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.01;
  return false;
}

function runEngineSelfTests(): { passed: number; failures: Failure[] } {
  const failures: Failure[] = [];
  let passed = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    if (isEqual(actual, expected)) passed += 1;
    else failures.push({ label, actual, expected });
  };

  const damga = computeDamgaOnly(10000);
  check("damga-only binde 7,59", damga.damgaVergisi, round2(10000 * 0.00759));
  check("damga-only net", damga.net, round2(10000 - damga.damgaVergisi));

  const istisnali = computeNetFromGrossSingle(26005.5, 2025);
  check("istisnali net > 0", istisnali.net > 0, true);
  check("istisnali sgk", istisnali.sgk, round2(26005.5 * 0.14));

  const istisnasiz = computeStandartBrutNetFromGross(10000, 2024);
  check("istisnasiz istisna 0", istisnasiz.gelirVergisiIstisna, 0);

  const legal = calculateInterest({
    principal: 1000,
    startDate: "2024-06-01",
    endDate: "2024-06-30",
    interestType: "LEGAL_INTEREST",
  });
  check("yasal faiz ok", legal.ok, true);

  const legal2026 = calculateInterest({
    principal: 10000,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    interestType: "LEGAL_INTEREST",
  });
  check("yasal faiz 2026-08 oran 31", legal2026.ok === true && legal2026.periods[0]?.rate === 31, true);

  const legalSplit = calculateInterest({
    principal: 10000,
    startDate: "2026-07-15",
    endDate: "2026-08-15",
    interestType: "LEGAL_INTEREST",
  });
  check(
    "yasal faiz 2026-07/08 dönem ayrımı",
    legalSplit.ok === true && legalSplit.periods.length === 2 && legalSplit.periods[1]?.rate === 31,
    true,
  );

  const deposit = calculateInterest({
    principal: 1000,
    startDate: "2024-06-01",
    endDate: "2024-06-30",
    interestType: "HIGHEST_DEPOSIT_INTEREST",
  });
  check("mevduat BLOKE", deposit.ok, false);
  if (deposit.ok === false) {
    check("mevduat mesaj", deposit.message, DEPOSIT_INTEREST_BLOKE_MESSAGE);
  }

  if (failures.length > 0) console.error(`icra engine.test: ${failures.length} failure(s)`, failures);
  else console.log(`icra engine.test: ${passed} test geçti ✔`);
  return { passed, failures };
}

const result = runEngineSelfTests();
if (result.failures.length > 0) throw new Error(`icra engine.test: ${result.failures.length} failure(s)`);
