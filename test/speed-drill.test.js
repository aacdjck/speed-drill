"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const content = JSON.parse(
  fs.readFileSync(path.join(root, "content/ai-compute-earth-orbit.json"), "utf8")
);
const flatworm = JSON.parse(
  fs.readFileSync(path.join(root, "content/flatworm-two-heads.json"), "utf8")
);
const howDna = JSON.parse(
  fs.readFileSync(path.join(root, "content/how-dna-becomes-you.json"), "utf8")
);
const howFood = JSON.parse(
  fs.readFileSync(path.join(root, "content/how-food-becomes-you.json"), "utf8")
);

const EXISTING_SHA256 = {
  "frontier-bank": "56b359215874b59dee8df00158c4c13b404664152b262d013b3f697f88737a27",
  "musk-bank": "58593f4d9728edf582280d1caf9514bef4cffcd9b222b05f5ff30a74ef199d77",
  "health-bank": "b942ef1c2448427aca3f95414a83772a9c2364683c9b617f7f5214ca1ee60d14",
  "frontier-explain": "cd6c21ce84fb310e086b7ff49405caf968128c846ef3c85d8a2e33b5fdba55b0",
  "musk-explain": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  "health-explain": "5fd5c011b2c9f954a53a4cad182c7be33f55c7efd57eb16326859e66a6df4bfe",
  "ai-compute-bank": "20baf654214af545e7ead0fcacd523bb111285ec6f5ad76101ed6dfd6fd1d0b4",
  "ai-compute-explain": "33143d7d9cb1e1b93b7e464f5dd6ef9399f705afd207900063382654bcdcf3cb",
  "flatworm-bank": "6c38443952459f4594c058741fbf3bad3db35bb5c538e67bcaf2d48e6daae8eb",
  "flatworm-explain": "0b0d6b53d100d01b4c4ec6417ab55b663b157871c06b0b083f34d7166ce18120",
  "how-dna-bank": "0c03897cbb188b502360ccb87fd6951925d1671d76fa948d4419df54d8166f2c",
  "how-dna-explain": "eeed1d45a995ddf610007dfef5e7ea4c85fac37425e1b845f61994d640809904",
};

function scriptBody(id) {
  const re = new RegExp(
    `<script id="${id}"(?: type="application/json")?>([\\s\\S]*?)</script>`
  );
  const match = html.match(re);
  assert.ok(match, `missing script #${id}`);
  return match[1];
}

function jsonScript(id) {
  return JSON.parse(scriptBody(id));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  let open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

function memoryStorage() {
  const mem = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },
    setItem(key, value) {
      mem[key] = String(value);
    },
  };
}

function loadCore() {
  const context = vm.createContext({
    console,
    Math,
    Date,
    Set,
    Number,
    String,
    Object,
    Array,
    JSON,
    parseInt,
  });
  vm.runInContext(scriptBody("drill-core"), context, { filename: "drill-core.js" });
  const app = html.split('<script id="drill-core">')[1].split("</script>").slice(1).join("</script>");
  vm.runInContext(
    `${extractFunction(app, "cardOptions")}\n${extractFunction(app, "explainFor")}`,
    context,
    { filename: "deck-helpers.js" }
  );
  return context;
}

const core = loadCore();

function siteItem(question) {
  return [
    question.question,
    question.correct_answer,
    question.options.filter((_, index) => index !== question.answer_index),
  ];
}

test("answer_index_base is 0 and every correct_answer is options[answer_index]", () => {
  assert.equal(content.answer_index_base, 0);
  assert.equal(content.category_id, "ai-compute-earth-orbit");
  assert.equal(content.category_title, "AI Compute: Earth & Orbit");
  assert.equal(content.question_count, 75);
  assert.equal(content.questions.length, 75);
  const ids = new Set();
  const prompts = new Set();
  const indexCounts = [0, 0, 0, 0];
  for (const question of content.questions) {
    assert.equal(typeof question.id, "string");
    assert.ok(question.id.startsWith("ai-compute-"));
    assert.ok(!ids.has(question.id), question.id);
    ids.add(question.id);
    assert.equal(typeof question.topic, "string");
    assert.ok(question.topic.trim());
    assert.equal(typeof question.question, "string");
    assert.ok(question.question.trim());
    assert.ok(!prompts.has(question.question), question.question);
    prompts.add(question.question);
    assert.ok(Array.isArray(question.options));
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    for (const option of question.options) {
      assert.equal(typeof option, "string");
      assert.ok(option.trim());
    }
    assert.equal(Number.isInteger(question.answer_index), true);
    assert.ok(question.answer_index >= 0 && question.answer_index <= 3);
    assert.equal(question.options[question.answer_index], question.correct_answer);
    assert.equal(question.options.includes(question.correct_answer), true);
    assert.equal(typeof question.why, "string");
    assert.ok(question.why.trim());
    assert.equal("source_turns" in question, false);
    assert.equal("basis" in question, false);
    assert.equal("verification_source" in question, false);
    assert.equal("verification_sources" in question, false);
    indexCounts[question.answer_index] += 1;
  }
  for (const count of indexCounts) assert.ok(count > 0);
});

test("published deck matches the 0-based answers and keeps conditional wording", () => {
  const bank = jsonScript("ai-compute-bank");
  const explain = jsonScript("ai-compute-explain");
  assert.equal(bank.length, 75);
  assert.equal(Object.keys(explain).length, 75);
  content.questions.forEach((question, index) => {
    const item = siteItem(question);
    assert.deepEqual(bank[index], item);
    assert.equal(bank[index][1], question.options[question.answer_index]);
    assert.equal(bank[index][2].includes(bank[index][1]), false);
    assert.equal(explain[question.question], question.why);
  });

  const byId = Object.fromEntries(content.questions.map((question) => [question.id, question]));
  assert.equal(
    byId["ai-compute-075"].correct_answer,
    "Near-term ground capacity may have value while orbital upside remains conditional on execution and economics"
  );
  assert.equal(
    byId["ai-compute-070"].correct_answer,
    "Large potential upside if execution succeeds, alongside meaningful concentrated downside"
  );
  assert.equal(
    byId["ai-compute-059"].correct_answer,
    "As an assumption-dependent research scenario, not a universal break-even guarantee"
  );
  assert.match(byId["ai-compute-065"].why, /contingent on actual cash generation/);
  assert.match(byId["ai-compute-045"].why, /not automatically a durable return forecast/);
  assert.equal(
    explain[byId["ai-compute-075"].question],
    byId["ai-compute-075"].why
  );
});

test("published category omits source-turn markers, transcript URLs, and private sidecars", () => {
  const published = scriptBody("ai-compute-bank") + scriptBody("ai-compute-explain");
  const dataset = fs.readFileSync(path.join(root, "content/ai-compute-earth-orbit.json"), "utf8");
  for (const blob of [published, dataset]) {
    assert.equal(/source_turns/.test(blob), false);
    assert.equal(/source turn/i.test(blob), false);
    assert.equal(/drawn from the discussion/.test(blob), false);
    assert.equal(/https?:\/\//.test(blob), false);
    assert.equal(/nvidianews|blog\.google|grok\.com|x\.com\/i/i.test(blob), false);
    assert.equal(/transcript/i.test(blob), false);
    assert.equal(/verification_source/.test(blob), false);
  }
});

test("new category is in the same list and Frontier stays the default", () => {
  const select = html.match(/<select id="deck">([\s\S]*?)<\/select>/);
  assert.ok(select);
  const options = [...select[1].matchAll(/<option value="([^"]+)"([^>]*)>(.*?)<\/option>/g)].map(
    (match) => ({
      value: match[1],
      selected: /\bselected\b/.test(match[2]),
      label: match[3],
    })
  );
  assert.deepEqual(
    options.map((option) => option.value),
    [
      "frontier",
      "musk",
      "health",
      "ai_compute",
      "flatworm",
      "how_dna",
      "how_food",
      "math_2digit",
      "add_3mix",
      "fractions",
      "fractions_fill",
      "flip",
    ]
  );
  assert.deepEqual(
    options.filter((option) => option.selected).map((option) => option.value),
    ["frontier"]
  );
  assert.equal(options.find((option) => option.value === "ai_compute").label, "AI Compute: Earth &amp; Orbit (rotated)");
  assert.equal(options.find((option) => option.value === "flatworm").label, "Flatworm: two heads (rotated)");
  assert.equal(options.find((option) => option.value === "how_dna").label, "How DNA becomes you (rotated)");
  assert.equal(options.find((option) => option.value === "how_food").label, "How food becomes you (rotated)");
  assert.match(html, /deckKey:\s*"frontier"/);
  assert.match(html, /<option value="20" selected>20s<\/option>/);
  assert.match(html, /<option value="20" selected>20<\/option>/);
  assert.match(html, /generate: \(n\) => AI_COMPUTE\.selectRound\(n\)/);
  assert.match(html, /AI_COMPUTE\.markShown\(prompt\)/);
  assert.match(html, /AI_COMPUTE\.markResult\(state\.current\.prompt, ok\)/);
  assert.match(html, /explain: loadExplain\("ai-compute-explain"\)/);
  assert.match(html, /generate: \(n\) => FLATWORM\.selectRound\(n\)/);
  assert.match(html, /FLATWORM\.markShown\(prompt\)/);
  assert.match(html, /FLATWORM\.markResult\(state\.current\.prompt, ok\)/);
  assert.match(html, /explain: loadExplain\("flatworm-explain"\)/);
  assert.match(html, /generate: \(n\) => HOW_DNA\.selectRound\(n\)/);
  assert.match(html, /HOW_DNA\.markShown\(prompt\)/);
  assert.match(html, /HOW_DNA\.markResult\(state\.current\.prompt, ok\)/);
  assert.match(html, /explain: loadExplain\("how-dna-explain"\)/);
  assert.match(html, /generate: \(n\) => HOW_FOOD\.selectRound\(n\)/);
  assert.match(html, /HOW_FOOD\.markShown\(prompt\)/);
  assert.match(html, /HOW_FOOD\.markResult\(state\.current\.prompt, ok\)/);
  assert.match(html, /explain: loadExplain\("how-food-explain"\)/);
  const storeKeys = ["FRONTIER_STORE_KEY", "MUSK_STORE_KEY", "HEALTH_STORE_KEY", "AI_COMPUTE_STORE_KEY", "FLATWORM_STORE_KEY", "HOW_DNA_STORE_KEY", "HOW_FOOD_STORE_KEY"].map(
    (name) => {
      const match = html.match(new RegExp(`const ${name} = "([^"]+)"`));
      assert.ok(match, name);
      return match[1];
    }
  );
  assert.equal(new Set(storeKeys).size, storeKeys.length);
});

test("existing rotated banks and explanations are byte-for-byte unchanged", () => {
  for (const [id, hash] of Object.entries(EXISTING_SHA256)) {
    assert.equal(sha256(scriptBody(id)), hash, id);
  }
  assert.equal(jsonScript("frontier-bank").length, 77);
  assert.equal(jsonScript("musk-bank").length, 114);
  assert.equal(jsonScript("health-bank").length, 70);
  assert.equal(Object.keys(jsonScript("frontier-explain")).length, 77);
  assert.equal(Object.keys(jsonScript("health-explain")).length, 28);
  assert.deepEqual(jsonScript("musk-explain"), {});
});

test("rotation covers the new bank, shuffles questions, and keeps a separate memory", () => {
  const bank = content.questions.map(siteItem);
  const seen = new Set();
  const rotation = core.createAiComputeRotation(bank, memoryStorage());
  const first = rotation.selectRound(20).map((item) => item[0]);
  const again = core.createAiComputeRotation(bank, memoryStorage()).selectRound(20).map((item) => item[0]);
  assert.equal(first.length, 20);
  assert.equal(new Set(first).size, 20);
  assert.notDeepEqual(first, again);
  for (let round = 0; round < 8; round++) {
    const items = rotation.selectRound(20);
    assert.equal(items.length, 20);
    const prompts = items.map((item) => item[0]);
    assert.equal(new Set(prompts).size, 20);
    for (const item of items) {
      assert.equal(bank.some((entry) => entry[0] === item[0] && entry[1] === item[1]), true);
      rotation.markShown(item[0]);
      rotation.markResult(item[0], false);
      seen.add(item[0]);
    }
  }
  assert.equal(seen.size, 75);

  const frontier = jsonScript("frontier-bank");
  const frontierRound = core.createFrontierRotation(frontier, memoryStorage()).selectRound(20);
  assert.equal(frontierRound.length, 20);
  for (const item of frontierRound) {
    assert.equal(frontier.some((entry) => entry[0] === item[0]), true);
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }
});

test("option order is shuffled and the correct text stays in the set", () => {
  const bank = content.questions.map(siteItem);
  const orders = new Set();
  for (let i = 0; i < 24; i++) {
    const options = core.cardOptions(bank[0], { items: [] });
    assert.equal(options.length, 4);
    assert.deepEqual([...options].sort(), [bank[0][1], ...bank[0][2]].sort());
    assert.equal(options.filter((option) => option === bank[0][1]).length, 1);
    orders.add(options.join("\n"));
  }
  assert.ok(orders.size > 1);

  const frontierItem = jsonScript("frontier-bank")[0];
  const frontierOptions = core.cardOptions(frontierItem, { items: [] });
  assert.deepEqual([...frontierOptions].sort(), [frontierItem[1], ...frontierItem[2]].sort());
});

test("review Why uses the deck explanation for the new category", () => {
  const explain = jsonScript("ai-compute-explain");
  core.DECKS = {
    ai_compute: { explain },
    frontier: { explain: jsonScript("frontier-explain") },
  };
  for (const question of content.questions) {
    const why = core.explainFor("ai_compute", question.question);
    assert.equal(why, question.why);
    assert.equal(why.length > 0, true);
  }
  const frontier = jsonScript("frontier-bank")[0][0];
  assert.equal(core.explainFor("frontier", frontier), jsonScript("frontier-explain")[frontier]);
  assert.equal(core.explainFor("musk", "missing"), "");
});


test("flatworm bank is 0-based, unique, and has hard four-choice items", () => {
  assert.equal(flatworm.answer_index_base, 0);
  assert.equal(flatworm.category_id, "flatworm-two-heads");
  assert.equal(flatworm.category_title, "Flatworm: two heads");
  assert.equal(flatworm.question_count, 20);
  assert.equal(flatworm.questions.length, 20);
  const ids = new Set();
  const prompts = new Set();
  const indexCounts = [0, 0, 0, 0];
  for (const question of flatworm.questions) {
    assert.equal(typeof question.id, "string");
    assert.ok(question.id.startsWith("flatworm-"));
    assert.ok(!ids.has(question.id), question.id);
    ids.add(question.id);
    assert.equal(typeof question.topic, "string");
    assert.ok(question.topic.trim());
    assert.equal(typeof question.question, "string");
    assert.ok(question.question.trim());
    assert.ok(!prompts.has(question.question), question.question);
    prompts.add(question.question);
    assert.ok(Array.isArray(question.options));
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    for (const option of question.options) {
      assert.equal(typeof option, "string");
      assert.ok(option.trim());
    }
    assert.equal(Number.isInteger(question.answer_index), true);
    assert.ok(question.answer_index >= 0 && question.answer_index <= 3);
    assert.equal(question.options[question.answer_index], question.correct_answer);
    assert.equal(question.options.includes(question.correct_answer), true);
    assert.equal(typeof question.why, "string");
    assert.ok(question.why.trim());
    assert.equal("source_turns" in question, false);
    assert.equal("basis" in question, false);
    assert.equal("verification_source" in question, false);
    assert.equal("verification_sources" in question, false);
    indexCounts[question.answer_index] += 1;
  }
  for (const count of indexCounts) assert.ok(count > 0);
  const idList = flatworm.questions.map((question) => question.id);
  assert.ok(idList.includes("flatworm-p1"));
  assert.ok(idList.includes("flatworm-p2"));
});

test("published flatworm deck matches the 0-based answers and keeps softened claims", () => {
  const bank = jsonScript("flatworm-bank");
  const explain = jsonScript("flatworm-explain");
  assert.equal(bank.length, 20);
  assert.equal(Object.keys(explain).length, 20);
  flatworm.questions.forEach((question, index) => {
    const item = siteItem(question);
    assert.deepEqual(bank[index], item);
    assert.equal(bank[index][1], question.options[question.answer_index]);
    assert.equal(bank[index][2].includes(bank[index][1]), false);
    assert.equal(explain[question.question], question.why);
  });

  const byId = Object.fromEntries(flatworm.questions.map((question) => [question.id, question]));
  assert.equal(byId["flatworm-002"].correct_answer, "About a quarter");
  assert.equal(
    byId["flatworm-008"].correct_answer,
    "About a third returned to one head and stayed one-headed through at least four more recuts"
  );
  assert.equal(
    byId["flatworm-012"].correct_answer,
    "For months, until the worms were too small to cut"
  );
  assert.equal(
    byId["flatworm-011"].correct_answer,
    "Nobody edited their genes, and the chemical washes out within a day"
  );
  assert.match(byId["flatworm-011"].why, /does not claim the DNA was sequenced/);
  assert.equal(
    byId["flatworm-009"].correct_answer,
    "The voltage pattern is a stored target shape the body works toward, like a memory"
  );
  assert.match(byId["flatworm-009"].why, /Levin's proposal/);
  assert.match(byId["flatworm-020"].why, /illustrate Levin's proposal/);
  assert.equal(
    byId["flatworm-p1"].correct_answer,
    "Almost never. The existing head's signals keep the other end a tail"
  );
  assert.equal(
    byId["flatworm-p2"].correct_answer,
    "Two heads again, in every worm in the recut group"
  );
});

test("published flatworm category omits source-turn markers, transcript URLs, and private sidecars", () => {
  const published = scriptBody("flatworm-bank") + scriptBody("flatworm-explain");
  const dataset = fs.readFileSync(path.join(root, "content/flatworm-two-heads.json"), "utf8");
  for (const blob of [published, dataset]) {
    assert.equal(/source_turns/.test(blob), false);
    assert.equal(/source turn/i.test(blob), false);
    assert.equal(/drawn from the discussion/.test(blob), false);
    assert.equal(/https?:\/\//.test(blob), false);
    assert.equal(/transcript/i.test(blob), false);
    assert.equal(/verification_source/.test(blob), false);
  }
});

test("flatworm rotation covers the bank, shuffles questions, and keeps a separate memory", () => {
  const bank = flatworm.questions.map(siteItem);
  const seen = new Set();
  const rotation = core.createFlatwormRotation(bank, memoryStorage());
  const first = rotation.selectRound(8).map((item) => item[0]);
  const again = core.createFlatwormRotation(bank, memoryStorage()).selectRound(8).map((item) => item[0]);
  assert.equal(first.length, 8);
  assert.equal(new Set(first).size, 8);
  assert.notDeepEqual(first, again);
  for (let round = 0; round < 6; round++) {
    const items = rotation.selectRound(8);
    assert.equal(items.length, 8);
    const prompts = items.map((item) => item[0]);
    assert.equal(new Set(prompts).size, 8);
    for (const item of items) {
      assert.equal(bank.some((entry) => entry[0] === item[0] && entry[1] === item[1]), true);
      rotation.markShown(item[0]);
      rotation.markResult(item[0], false);
      seen.add(item[0]);
    }
  }
  assert.equal(seen.size, 20);

  const frontier = jsonScript("frontier-bank");
  const frontierRound = core.createFrontierRotation(frontier, memoryStorage()).selectRound(20);
  assert.equal(frontierRound.length, 20);
  for (const item of frontierRound) {
    assert.equal(frontier.some((entry) => entry[0] === item[0]), true);
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }

  const compute = jsonScript("ai-compute-bank");
  const computeRound = core.createAiComputeRotation(compute, memoryStorage()).selectRound(20);
  for (const item of computeRound) {
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }
});

test("flatworm option order is shuffled and review Why uses the deck explanation", () => {
  const bank = flatworm.questions.map(siteItem);
  const orders = new Set();
  for (let i = 0; i < 24; i++) {
    const options = core.cardOptions(bank[0], { items: [] });
    assert.equal(options.length, 4);
    assert.deepEqual([...options].sort(), [bank[0][1], ...bank[0][2]].sort());
    assert.equal(options.filter((option) => option === bank[0][1]).length, 1);
    orders.add(options.join("\n"));
  }
  assert.ok(orders.size > 1);

  const explain = jsonScript("flatworm-explain");
  core.DECKS = {
    flatworm: { explain },
    frontier: { explain: jsonScript("frontier-explain") },
  };
  for (const question of flatworm.questions) {
    const why = core.explainFor("flatworm", question.question);
    assert.equal(why, question.why);
    assert.equal(why.length > 0, true);
  }
  const frontier = jsonScript("frontier-bank")[0][0];
  assert.equal(core.explainFor("frontier", frontier), jsonScript("frontier-explain")[frontier]);
  assert.equal(core.explainFor("flatworm", "missing"), "");
});


test("how-dna bank is 0-based, unique, and has hard four-choice items", () => {
  assert.equal(howDna.answer_index_base, 0);
  assert.equal(howDna.category_id, "how-dna-becomes-you");
  assert.equal(howDna.category_title, "How DNA becomes you");
  assert.equal(howDna.question_count, 16);
  assert.equal(howDna.questions.length, 16);
  const ids = new Set();
  const prompts = new Set();
  const indexCounts = [0, 0, 0, 0];
  for (const question of howDna.questions) {
    assert.equal(typeof question.id, "string");
    assert.ok(question.id.startsWith("dna-"));
    assert.ok(!ids.has(question.id), question.id);
    ids.add(question.id);
    assert.equal(typeof question.topic, "string");
    assert.ok(question.topic.trim());
    assert.equal(typeof question.question, "string");
    assert.ok(question.question.trim());
    assert.ok(!prompts.has(question.question), question.question);
    prompts.add(question.question);
    assert.ok(Array.isArray(question.options));
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    for (const option of question.options) {
      assert.equal(typeof option, "string");
      assert.ok(option.trim());
    }
    assert.equal(Number.isInteger(question.answer_index), true);
    assert.ok(question.answer_index >= 0 && question.answer_index <= 3);
    assert.equal(question.options[question.answer_index], question.correct_answer);
    assert.equal(question.options.includes(question.correct_answer), true);
    assert.equal(typeof question.why, "string");
    assert.ok(question.why.trim());
    assert.equal("source_turns" in question, false);
    assert.equal("basis" in question, false);
    assert.equal("verification_source" in question, false);
    assert.equal("verification_sources" in question, false);
    indexCounts[question.answer_index] += 1;
  }
  for (const count of indexCounts) assert.ok(count > 0);
  const idList = howDna.questions.map((question) => question.id);
  assert.deepEqual(idList, [
    "dna-001",
    "dna-002",
    "dna-003",
    "dna-004",
    "dna-005",
    "dna-006",
    "dna-007",
    "dna-008",
    "dna-009",
    "dna-010",
    "dna-011",
    "dna-012",
    "dna-013",
    "dna-014",
    "dna-015",
    "dna-016",
  ]);
});

test("published how-dna deck matches the 0-based answers and keeps Levin labeled as a proposal", () => {
  const bank = jsonScript("how-dna-bank");
  const explain = jsonScript("how-dna-explain");
  assert.equal(bank.length, 16);
  assert.equal(Object.keys(explain).length, 16);
  howDna.questions.forEach((question, index) => {
    const item = siteItem(question);
    assert.deepEqual(bank[index], item);
    assert.equal(bank[index][1], question.options[question.answer_index]);
    assert.equal(bank[index][2].includes(bank[index][1]), false);
    assert.equal(explain[question.question], question.why);
  });

  const byId = Object.fromEntries(howDna.questions.map((question) => [question.id, question]));
  assert.equal(
    byId["dna-001"].correct_answer,
    "Each uses a different set of genes, switched on while the rest stay closed."
  );
  assert.equal(
    byId["dna-002"].correct_answer,
    "DNA is copied into RNA, and the RNA is read to make a protein."
  );
  assert.equal(byId["dna-003"].correct_answer, "Cells between the fingers die on schedule.");
  assert.equal(
    byId["dna-006"].correct_answer,
    "A working RNA copy of just that recipe leaves the library. A cook reads it three letters at a time, links the ingredients into a chain, and the chain folds into a shape that does the job."
  );
  assert.match(byId["dna-006"].why, /original book stays/);
  assert.match(
    byId["dna-011"].correct_answer,
    /Levin's proposal, still being tested/
  );
  assert.match(byId["dna-011"].why, /not settled fact/);
  assert.equal(
    byId["dna-014"].correct_answer,
    "It is a proposal: patterns of electrical signals across tissue may help guide body shape beyond genes, and it is still being tested."
  );
  assert.match(byId["dna-014"].why, /does not replace them/);
  assert.match(byId["dna-015"].correct_answer, /bakery and a pizzeria/);
  assert.match(byId["dna-016"].correct_answer, /flock of birds/);
});

test("published how-dna category omits source-turn markers, transcript URLs, and private sidecars", () => {
  const published = scriptBody("how-dna-bank") + scriptBody("how-dna-explain");
  const dataset = fs.readFileSync(path.join(root, "content/how-dna-becomes-you.json"), "utf8");
  for (const blob of [published, dataset]) {
    assert.equal(/source_turns/.test(blob), false);
    assert.equal(/source turn/i.test(blob), false);
    assert.equal(/drawn from the discussion/.test(blob), false);
    assert.equal(/https?:\/\//.test(blob), false);
    assert.equal(/transcript/i.test(blob), false);
    assert.equal(/verification_source/.test(blob), false);
  }
});

test("how-dna rotation covers the bank, shuffles questions, and keeps a separate memory", () => {
  const bank = howDna.questions.map(siteItem);
  const seen = new Set();
  const rotation = core.createHowDnaRotation(bank, memoryStorage());
  const first = rotation.selectRound(8).map((item) => item[0]);
  const again = core.createHowDnaRotation(bank, memoryStorage()).selectRound(8).map((item) => item[0]);
  assert.equal(first.length, 8);
  assert.equal(new Set(first).size, 8);
  assert.notDeepEqual(first, again);
  for (let round = 0; round < 6; round++) {
    const items = rotation.selectRound(8);
    assert.equal(items.length, 8);
    const prompts = items.map((item) => item[0]);
    assert.equal(new Set(prompts).size, 8);
    for (const item of items) {
      assert.equal(bank.some((entry) => entry[0] === item[0] && entry[1] === item[1]), true);
      rotation.markShown(item[0]);
      rotation.markResult(item[0], false);
      seen.add(item[0]);
    }
  }
  assert.equal(seen.size, 16);

  const twenty = core.createHowDnaRotation(bank, memoryStorage()).selectRound(20);
  assert.equal(twenty.length, 16);

  const frontier = jsonScript("frontier-bank");
  const frontierRound = core.createFrontierRotation(frontier, memoryStorage()).selectRound(20);
  assert.equal(frontierRound.length, 20);
  for (const item of frontierRound) {
    assert.equal(frontier.some((entry) => entry[0] === item[0]), true);
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }

  const compute = jsonScript("ai-compute-bank");
  const computeRound = core.createAiComputeRotation(compute, memoryStorage()).selectRound(20);
  for (const item of computeRound) {
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }

  const worm = jsonScript("flatworm-bank");
  const wormRound = core.createFlatwormRotation(worm, memoryStorage()).selectRound(8);
  for (const item of wormRound) {
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }
});

test("how-dna option order is shuffled and review Why uses the deck explanation", () => {
  const bank = howDna.questions.map(siteItem);
  const orders = new Set();
  for (let i = 0; i < 24; i++) {
    const options = core.cardOptions(bank[0], { items: [] });
    assert.equal(options.length, 4);
    assert.deepEqual([...options].sort(), [bank[0][1], ...bank[0][2]].sort());
    assert.equal(options.filter((option) => option === bank[0][1]).length, 1);
    orders.add(options.join("\n"));
  }
  assert.ok(orders.size > 1);

  const explain = jsonScript("how-dna-explain");
  core.DECKS = {
    how_dna: { explain },
    frontier: { explain: jsonScript("frontier-explain") },
  };
  for (const question of howDna.questions) {
    const why = core.explainFor("how_dna", question.question);
    assert.equal(why, question.why);
    assert.equal(why.length > 0, true);
  }
  const frontier = jsonScript("frontier-bank")[0][0];
  assert.equal(core.explainFor("frontier", frontier), jsonScript("frontier-explain")[frontier]);
  assert.equal(core.explainFor("how_dna", "missing"), "");
});


test("how-food bank is 0-based, unique, mixed, and has hard four-choice items", () => {
  assert.equal(howFood.answer_index_base, 0);
  assert.equal(howFood.category_id, "how-food-becomes-you");
  assert.equal(howFood.category_title, "How food becomes you");
  assert.equal(howFood.question_count, 16);
  assert.equal(howFood.questions.length, 16);
  const ids = new Set();
  const prompts = new Set();
  const indexCounts = [0, 0, 0, 0];
  for (const question of howFood.questions) {
    assert.equal(typeof question.id, "string");
    assert.ok(question.id.startsWith("food-"));
    assert.ok(!ids.has(question.id), question.id);
    ids.add(question.id);
    assert.equal(typeof question.topic, "string");
    assert.ok(question.topic.trim());
    assert.equal(typeof question.question, "string");
    assert.ok(question.question.trim());
    assert.ok(!prompts.has(question.question), question.question);
    prompts.add(question.question);
    assert.ok(Array.isArray(question.options));
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    for (const option of question.options) {
      assert.equal(typeof option, "string");
      assert.ok(option.trim());
    }
    assert.equal(Number.isInteger(question.answer_index), true);
    assert.ok(question.answer_index >= 0 && question.answer_index <= 3);
    assert.equal(question.options[question.answer_index], question.correct_answer);
    assert.equal(question.options.includes(question.correct_answer), true);
    assert.equal(typeof question.why, "string");
    assert.ok(question.why.trim());
    assert.equal("source_turns" in question, false);
    assert.equal("basis" in question, false);
    assert.equal("verification_source" in question, false);
    assert.equal("verification_sources" in question, false);
    indexCounts[question.answer_index] += 1;
  }
  for (const count of indexCounts) assert.ok(count > 0);
  const idList = howFood.questions.map((question) => question.id);
  assert.deepEqual(
    [...idList].sort(),
    [
      "food-001",
      "food-002",
      "food-003",
      "food-004",
      "food-005",
      "food-006",
      "food-007",
      "food-008",
      "food-009",
      "food-010",
      "food-011",
      "food-012",
      "food-013",
      "food-014",
      "food-015",
      "food-016",
    ]
  );
  assert.notDeepEqual(idList, [
    "food-001",
    "food-002",
    "food-003",
    "food-004",
    "food-005",
    "food-006",
    "food-007",
    "food-008",
    "food-009",
    "food-010",
    "food-011",
    "food-012",
    "food-013",
    "food-014",
    "food-015",
    "food-016",
  ]);
});

test("published how-food deck matches the 0-based answers and keeps the science corrections", () => {
  const bank = jsonScript("how-food-bank");
  const explain = jsonScript("how-food-explain");
  assert.equal(bank.length, 16);
  assert.equal(Object.keys(explain).length, 16);
  howFood.questions.forEach((question, index) => {
    const item = siteItem(question);
    assert.deepEqual(bank[index], item);
    assert.equal(bank[index][1], question.options[question.answer_index]);
    assert.equal(bank[index][2].includes(bank[index][1]), false);
    assert.equal(explain[question.question], question.why);
  });

  const byId = Object.fromEntries(howFood.questions.map((question) => [question.id, question]));
  assert.equal(
    byId["food-001"].correct_answer,
    "The carbon in food that your cells took apart for fuel."
  );
  assert.equal(
    byId["food-002"].correct_answer,
    "Protein doors in the cell's skin, each shaped to open for only one kind of piece."
  );
  assert.equal(
    byId["food-009"].correct_answer,
    "A small rechargeable battery that carries energy to wherever work needs doing in the cell."
  );
  assert.match(
    byId["food-006"].correct_answer,
    /Enzymes cut the starch into sugars.*protein door shaped for sugar/
  );
  assert.match(byId["food-006"].why, /protein door that fits sugar/);
  assert.match(
    byId["food-011"].correct_answer,
    /carbon from the food leaves as carbon dioxide/
  );
  assert.match(byId["food-015"].correct_answer, /pattern stays and the pieces change/);
  assert.match(byId["food-016"].correct_answer, /material for building[\s\S]*fuel that is turned into power/);

  const published = scriptBody("how-food-bank") + scriptBody("how-food-explain");
  const dataset = fs.readFileSync(path.join(root, "content/how-food-becomes-you.json"), "utf8");
  for (const blob of [published, dataset]) {
    assert.equal(/many times a minute/i.test(blob), false);
    assert.equal(/liver pour/i.test(blob), false);
    assert.equal(/all the blood passes through the liver/i.test(blob), false);
    assert.equal(/all the blood through the liver/i.test(blob), false);
  }
  const correctAndWhy = howFood.questions
    .map((question) => `${question.correct_answer}\n${question.why}`)
    .join("\n");
  assert.equal(/snippers/.test(correctAndWhy) && /liver/.test(correctAndWhy) && /pancreas/.test(correctAndWhy), false);
});

test("published how-food category omits source-turn markers, transcript URLs, and private sidecars", () => {
  const published = scriptBody("how-food-bank") + scriptBody("how-food-explain");
  const dataset = fs.readFileSync(path.join(root, "content/how-food-becomes-you.json"), "utf8");
  for (const blob of [published, dataset]) {
    assert.equal(/source_turns/.test(blob), false);
    assert.equal(/source turn/i.test(blob), false);
    assert.equal(/drawn from the discussion/.test(blob), false);
    assert.equal(/https?:\/\//.test(blob), false);
    assert.equal(/transcript/i.test(blob), false);
    assert.equal(/verification_source/.test(blob), false);
  }
});

test("how-food rotation covers the bank, shuffles questions, and keeps a separate memory", () => {
  const bank = howFood.questions.map(siteItem);
  const seen = new Set();
  const rotation = core.createHowFoodRotation(bank, memoryStorage());
  const first = rotation.selectRound(8).map((item) => item[0]);
  const again = core.createHowFoodRotation(bank, memoryStorage()).selectRound(8).map((item) => item[0]);
  assert.equal(first.length, 8);
  assert.equal(new Set(first).size, 8);
  assert.notDeepEqual(first, again);
  for (let round = 0; round < 6; round++) {
    const items = rotation.selectRound(8);
    assert.equal(items.length, 8);
    const prompts = items.map((item) => item[0]);
    assert.equal(new Set(prompts).size, 8);
    for (const item of items) {
      assert.equal(bank.some((entry) => entry[0] === item[0] && entry[1] === item[1]), true);
      rotation.markShown(item[0]);
      rotation.markResult(item[0], false);
      seen.add(item[0]);
    }
  }
  assert.equal(seen.size, 16);

  const twenty = core.createHowFoodRotation(bank, memoryStorage()).selectRound(20);
  assert.equal(twenty.length, 16);

  const frontier = jsonScript("frontier-bank");
  const frontierRound = core.createFrontierRotation(frontier, memoryStorage()).selectRound(20);
  assert.equal(frontierRound.length, 20);
  for (const item of frontierRound) {
    assert.equal(frontier.some((entry) => entry[0] === item[0]), true);
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }

  const compute = jsonScript("ai-compute-bank");
  const computeRound = core.createAiComputeRotation(compute, memoryStorage()).selectRound(20);
  for (const item of computeRound) {
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }

  const worm = jsonScript("flatworm-bank");
  const wormRound = core.createFlatwormRotation(worm, memoryStorage()).selectRound(8);
  for (const item of wormRound) {
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }

  const dna = jsonScript("how-dna-bank");
  const dnaRound = core.createHowDnaRotation(dna, memoryStorage()).selectRound(8);
  for (const item of dnaRound) {
    assert.equal(bank.some((entry) => entry[0] === item[0]), false);
  }
});

test("how-food option order is shuffled and review Why uses the deck explanation", () => {
  const bank = howFood.questions.map(siteItem);
  const orders = new Set();
  for (let i = 0; i < 24; i++) {
    const options = core.cardOptions(bank[0], { items: [] });
    assert.equal(options.length, 4);
    assert.deepEqual([...options].sort(), [bank[0][1], ...bank[0][2]].sort());
    assert.equal(options.filter((option) => option === bank[0][1]).length, 1);
    orders.add(options.join("\n"));
  }
  assert.ok(orders.size > 1);

  const explain = jsonScript("how-food-explain");
  core.DECKS = {
    how_food: { explain },
    frontier: { explain: jsonScript("frontier-explain") },
  };
  for (const question of howFood.questions) {
    const why = core.explainFor("how_food", question.question);
    assert.equal(why, question.why);
    assert.equal(why.length > 0, true);
  }
  const frontier = jsonScript("frontier-bank")[0][0];
  assert.equal(core.explainFor("frontier", frontier), jsonScript("frontier-explain")[frontier]);
  assert.equal(core.explainFor("how_food", "missing"), "");
});

test("generated math, addition, and fraction decks still have the right answer", () => {
  const products = core.genMath2digit(12);
  assert.equal(products.length, 12);
  for (const [prompt, answer, distractors] of products) {
    const match = prompt.match(/^(\d+) × (\d+)$/);
    assert.ok(match, prompt);
    assert.equal(answer, String(Number(match[1]) * Number(match[2])));
    assert.equal(distractors.length, 3);
    assert.equal(distractors.includes(answer), false);
    assert.equal(new Set(distractors).size, 3);
  }

  const sums = core.genAdd3mix(12);
  assert.equal(sums.length, 12);
  for (const [prompt, answer, distractors] of sums) {
    const numbers = prompt.match(/\d+/g).map(Number);
    assert.equal(numbers.length, 3);
    assert.equal(answer, String(numbers.reduce((total, value) => total + value, 0)));
    assert.equal(distractors.length, 3);
    assert.equal(distractors.includes(answer), false);
  }

  const fractions = core.genFractions(12);
  assert.equal(fractions.length, 12);
  for (const [prompt, answer, distractors] of fractions) {
    const match = prompt.match(/^(\d+)\/(\d+) ([×+]) (\d+)\/(\d+)$/);
    assert.ok(match, prompt);
    const n1 = Number(match[1]);
    const d1 = Number(match[2]);
    const n2 = Number(match[4]);
    const d2 = Number(match[5]);
    const n = match[3] === "×" ? n1 * n2 : n1 * d2 + n2 * d1;
    const d = match[3] === "×" ? d1 * d2 : d1 * d2;
    const divisor = core.fgcd(n, d);
    const reduced = d / divisor === 1 ? String(n / divisor) : `${n / divisor}/${d / divisor}`;
    assert.equal(answer, reduced);
    assert.equal(distractors.length, 3);
    assert.equal(distractors.includes(answer), false);
  }

  assert.equal(core.fracEqualsText(core.parseFraction("five sixths"), "5/6"), true);
  assert.equal(core.fracEqualsText(core.parseFraction("one and one quarter"), "5/4"), true);
  assert.equal(core.fracEqualsText(core.parseFraction("five sevenths"), "5/6"), false);
});
