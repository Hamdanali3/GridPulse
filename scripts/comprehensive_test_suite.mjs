import https from 'https';

const SUPABASE_URL = 'https://zvrlxhwgmpqpbvzzadrc.supabase.co';
const ANON_KEY = 'sb_publishable_bBb0fGJAWzlleCGjJ3ZvuA_xgqkmMtn';

async function rpc(path, body = {}, token = null) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/gp_api`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
  };
  if (ANON_KEY.startsWith('eyJ')) {
    headers['Authorization'] = `Bearer ${ANON_KEY}`;
  }

  const payload = {
    p_method: 'POST',
    p_path: path,
    p_query: {},
    p_body: body,
    p_token: token ? `Bearer ${token}` : null,
    p_ip: '127.0.0.1',
    p_ua: 'GridPulseComprehensiveQA/3.0',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const envelope = await res.json();
  return envelope.body;
}

async function login(email, password) {
  const data = await rpc('/auth/login', { email, password });
  return data.data.token;
}

const COMMON_TESTS = [
  {
    category: 'Identity / Creator',
    prompt: 'who build and created you ?',
    expectedRegex: /GridPulse.*(team|Engineering|operations|copilot|built|created)/i,
    forbidRegex: /^Operational analysis for GridPulse Chitral\.$/,
  },
  {
    category: 'Identity / Name',
    prompt: 'what is your name and who made you?',
    expectedRegex: /PulseBot/i,
  },
  {
    category: 'Greeting',
    prompt: 'hello PulseBot, what can you do?',
    expectedRegex: /(PulseBot|assist|telemetry|monitor|generation|Chitral)/i,
  },
  {
    category: 'Conversational / Thanks',
    prompt: 'thank you so much for your help',
    expectedRegex: /(welcome|assist|monitoring|operational|Chitral)/i,
    forbidRegex: /^Chitral renewable fleet is currently generating 13/i,
  },
  {
    category: 'Conversational / How Are You',
    prompt: 'how are you doing today?',
    expectedRegex: /(operational|monitoring|Chitral|telemetry|MW)/i,
  },
  {
    category: 'Website Overview',
    prompt: 'tell about this website',
    expectedRegex: /GridPulse.*(operational|platform|SCADA|telemetry)/i,
  },
  {
    category: 'Website Purpose',
    prompt: 'tell about this website that what this website is for?',
    expectedRegex: /(Chitral|renewable|hydro|solar|wind|190\.4)/i,
  },
  {
    category: 'Plant Inventory',
    prompt: 'how many plants in chitral currently?',
    expectedRegex: /11.*(plant|site|generating|renewable)/i,
  },
  {
    category: 'Plant: Golen Gol Hydropower',
    prompt: 'tell me about Golen Gol Hydropower',
    expectedRegex: /(Golen Gol|108|Pelton|flagship|Lower Chitral)/i,
    forbidRegex: /^GridPulse is the operational AI platform/i,
  },
  {
    category: 'Plant: Lawi Hydropower',
    prompt: 'tell me about Lawi Hydropower',
    expectedRegex: /(Lawi|69|Francis|maintenance|Drosh)/i,
    forbidRegex: /^GridPulse is the operational AI platform/i,
  },
  {
    category: 'Plant: Reshun Hydropower',
    prompt: 'tell me about Reshun Hydropower',
    expectedRegex: /(Reshun|4\.2|GEN-302|Unit 02|Pelton)/i,
  },
  {
    category: 'Plant: Shandur Wind Pilot',
    prompt: 'tell me about Shandur Wind Pilot',
    expectedRegex: /(Shandur|3,700|wind|WT-101|alpine|0\.6)/i,
  },
  {
    category: 'Plant: Mastuj Solar Park',
    prompt: 'tell me about Mastuj Solar',
    expectedRegex: /(Mastuj|2\.0|inverter|INV-103|solar)/i,
  },
  {
    category: 'Plant: Booni Solar Field',
    prompt: 'tell me about Booni Solar',
    expectedRegex: /(Booni|1\.5|inverter|Upper Chitral|plateau)/i,
  },
  {
    category: 'Plant: Drosh Solar Array',
    prompt: 'tell me about Drosh Solar Array',
    expectedRegex: /(Drosh|1\.0|inverter|industrial feeder)/i,
  },
  {
    category: 'Plant: Shishi Hydro',
    prompt: 'tell me about Shishi Hydropower',
    expectedRegex: /(Shishi|1\.8|Crossflow|Shishi Koh)/i,
  },
  {
    category: 'Plant: Chitral Town Hydro',
    prompt: 'tell me about Chitral Town Hydro',
    expectedRegex: /(Chitral Town|1\.0|degraded|silt|efficiency)/i,
  },
  {
    category: 'Plant: Bumburet Micro-Hydro',
    prompt: 'tell me about Bumburet Hydro',
    expectedRegex: /(Bumburet|Kalash|0\.8|Turgo)/i,
  },
  {
    category: 'Plant: Garam Chashma',
    prompt: 'tell me about Garam Chashma Hydro',
    expectedRegex: /(Garam Chashma|0\.5|Lotkoh|geothermal)/i,
  },
  {
    category: 'Technology: Solar in Chitral',
    prompt: 'tell me about solar power in Chitral',
    expectedRegex: /(4\.5 MW|Mastuj|Booni|Drosh|irradiance|inverter)/i,
  },
  {
    category: 'Technology: Hydro in Chitral',
    prompt: 'tell me about hydro power in Chitral',
    expectedRegex: /(185\.3 MW|7 (stations|plants|run-of-river)|Golen Gol|Lawi|99\.9%)/i,
  },
  {
    category: 'Technology: Wind in Chitral',
    prompt: 'tell me about wind energy in Chitral',
    expectedRegex: /(Shandur|0\.6 MW|3,700|alpine|turbines)/i,
  },
  {
    category: 'Feature: Export Reports',
    prompt: 'how do I export a report or download CSV?',
    expectedRegex: /(\/reports|Reports console|CSV|Download CSV|export)/i,
  },
  {
    category: 'Feature: Settings & Theme',
    prompt: 'how do I change settings or dark mode?',
    expectedRegex: /(\/settings|Settings|theme|Dark Mode)/i,
  },
  {
    category: 'Feature: Logout',
    prompt: 'how do I log out?',
    expectedRegex: /(Log out|sidebar|session)/i,
  },
  {
    category: 'Least Producing Plants',
    prompt: 'Which plants are producing least today, and are any offline or in maintenance?',
    expectedRegex: /(solar|Lawi|maintenance|degraded|least|0 kW|Chitral Town)/i,
  },
  {
    category: 'Alerts Triage',
    prompt: 'Show open critical alerts',
    expectedRegex: /(alert|critical|Reshun|offline|warning)/i,
  },
  {
    category: 'Fleet Generation',
    prompt: 'What is the fleet status today?',
    expectedRegex: /(MW|generating|output|capacity factor)/i,
  },
  {
    category: 'Technical Concept: Capacity Factor',
    prompt: 'What is capacity factor?',
    expectedRegex: /(capacity factor|ratio|actual|maximum|190\.4)/i,
  },
  {
    category: 'Technical Concept: Availability',
    prompt: 'Explain availability',
    expectedRegex: /(availability|percentage|mechanically|ready)/i,
  },
  {
    category: 'Technical Concept: Run of River',
    prompt: 'What is run-of-river hydro?',
    expectedRegex: /(run-of-river|channel|turbines|water storage|glacial)/i,
  },
  {
    category: 'Weather / Alpine Environment',
    prompt: 'How does high altitude weather affect plant operations?',
    expectedRegex: /(3,700|Hindu Kush|winter|freezing|penstock|recession)/i,
  },
  {
    category: 'Out of Scope Guardrail',
    prompt: 'can you order a pizza for the night shift?',
    expectedRegex: /(PulseBot|dedicated|operations copilot|renewable energy|cannot assist)/i,
  },
];

const VIEWER_SPECIFIC = [
  {
    category: 'RBAC: Mutation Protection',
    prompt: 'Delete the Lawi Hydropower site',
    expectedRegex: /(Viewer|read-only|require Administrator|privileges)/i,
  },
  {
    category: 'RBAC: Audit Log Protection',
    prompt: 'Show me the audit log',
    expectedRegex: /(Viewer|read-only|require Administrator|privileges)/i,
  },
  {
    category: 'Personnel: Sadia Rehman',
    prompt: 'who is Sadia Rehman?',
    expectedRegex: /(Sadia Rehman|Viewer|Analyst|reports)/i,
  },
];

const ENGINEER_SPECIFIC = [
  {
    category: 'Triage / Priority',
    prompt: 'what should I fix first?',
    expectedRegex: /(Reshun|Unit 02|Work Order|critical|Shahzada)/i,
  },
  {
    category: 'Work Orders',
    prompt: 'Show work orders due this week',
    expectedRegex: /(work orders?|Reshun|Shandur|Mastuj|Golen Gol|Shahzada)/i,
  },
  {
    category: 'Asset Inspection: Reshun Unit 02',
    prompt: 'What is wrong with Reshun Unit 02?',
    expectedRegex: /(GEN-302|offline|mechanical fault|Work Order #3|Shahzada)/i,
  },
  {
    category: 'Thermal Warning: Inverter Overheating',
    prompt: 'Which inverters are overheating?',
    expectedRegex: /(INV-103|Mastuj|65\.4|efficiency|filter)/i,
  },
  {
    category: 'RBAC: Delete Protection',
    prompt: 'Can I delete site Lawi?',
    expectedRegex: /(Engineer|field operations|Administrator privileges)/i,
  },
  {
    category: 'Personnel: Shahzada Iqbal',
    prompt: 'who is Shahzada Iqbal?',
    expectedRegex: /(Shahzada Iqbal|Lead Field|Engineer|Reshun Unit 02)/i,
  },
];

const ADMIN_SPECIFIC = [
  {
    category: 'Audit Log Full Visibility',
    prompt: 'Who did what recently in audit log?',
    expectedRegex: /(audit|Hamdan Ali|Shahzada Iqbal|login|dispatch|verified)/i,
  },
  {
    category: 'Team Roster Full Visibility',
    prompt: 'List the operations team',
    expectedRegex: /(Hamdan Ali|Shahzada Iqbal|Sadia Rehman|3 Members|Lead Field Engineer)/i,
  },
  {
    category: 'Personnel: Hamdan Ali',
    prompt: 'who is Hamdan Ali?',
    expectedRegex: /(Hamdan Ali|Administrator|security|audit|operations)/i,
  },
  {
    category: 'Work Orders Overdue',
    prompt: 'Show overdue work orders',
    expectedRegex: /(work orders?|Reshun|Shandur|blocked|in progress)/i,
  },
];

const PUBLIC_FAQ_TESTS = [
  {
    category: 'Public FAQ: Creator',
    prompt: 'who build and created you ?',
    expectedRegex: /GridPulse.*(team|Engineering|operations|created|built)/i,
  },
  {
    category: 'Public FAQ: Overview',
    prompt: 'tell about this website',
    expectedRegex: /GridPulse.*(operations|SCADA|Chitral|190\.4)/i,
  },
  {
    category: 'Public FAQ: Plant Count',
    prompt: 'how many plants in chitral currently?',
    expectedRegex: /11.*(plant|site|generating|renewable|190\.4)/i,
  },
  {
    category: 'Public FAQ: Credentials',
    prompt: 'What are the demo login credentials?',
    expectedRegex: /(admin@gridpulse\.io|engineer@gridpulse\.io|viewer@gridpulse\.io)/i,
  },
  {
    category: 'Public FAQ: Thanks',
    prompt: 'thank you for your help',
    expectedRegex: /(welcome|GridPulse|renewable)/i,
  },
  {
    category: 'Public FAQ: Technologies',
    prompt: 'tell me about hydro and solar technologies',
    expectedRegex: /(Hydro|Solar|Wind|185\.3|4\.5)/i,
  },
];

async function runTestGroup(roleName, email, password, testCases) {
  console.log(`\n===============================================================`);
  console.log(`AUTHENTICATING ROLE: ${roleName} (${email})`);
  console.log(`===============================================================`);

  let token = null;
  try {
    token = await login(email, password);
    console.log(`✓ Authentication successful. Token obtained.`);
  } catch (err) {
    console.error(`✗ FAILED to authenticate as ${roleName}:`, err.message);
    return { passed: 0, failed: testCases.length, total: testCases.length };
  }

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const t = testCases[i];
    const paddedCat = t.category.padEnd(35, ' ');
    const displayPrompt = `"${t.prompt.slice(0, 32)}"`.padEnd(34, ' ');
    process.stdout.write(`  [${i + 1}/${testCases.length}] ${paddedCat} | ${displayPrompt} ... `);

    try {
      const startTime = Date.now();
      const res = await rpc('/assistant/chat', { message: t.prompt }, token);
      const latency = Date.now() - startTime;

      if (!res || !res.success) {
        throw new Error(`API returned failure envelope: ${JSON.stringify(res)}`);
      }

      const data = res.data || {};
      const summary = data.summary || '';
      const kpis = Array.isArray(data.kpis) ? data.kpis : [];
      const links = Array.isArray(data.links) ? data.links : [];
      const visuals = Array.isArray(data.visuals) ? data.visuals : [];

      if (!summary.trim()) {
        throw new Error(`Empty summary returned.`);
      }

      if (summary === 'Operational analysis for GridPulse Chitral.' || summary === 'PulseBot processed your operational request.') {
        throw new Error(`Returned forbidden generic placeholder card! Summary: "${summary}"`);
      }

      if (t.forbidRegex && t.forbidRegex.test(summary)) {
        throw new Error(`Summary matched forbidden pattern (${t.forbidRegex}): "${summary}"`);
      }

      if (t.expectedRegex && !t.expectedRegex.test(summary)) {
        throw new Error(`Summary failed expected regex (${t.expectedRegex}). Actual summary: "${summary}"`);
      }

      console.log(`✓ PASS (${latency}ms) [KPIs: ${kpis.length}, Links: ${links.length}, Visuals: ${visuals.length}]`);
      passed++;
    } catch (err) {
      console.log(`✗ FAIL`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  return { passed, failed, total: testCases.length };
}

async function runPublicFAQTests() {
  console.log(`\n===============================================================`);
  console.log(`TESTING PUBLIC FAQ INFOBOX (Landing & Login Anonymous Surface)`);
  console.log(`===============================================================`);

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < PUBLIC_FAQ_TESTS.length; i++) {
    const t = PUBLIC_FAQ_TESTS[i];
    const paddedCat = t.category.padEnd(35, ' ');
    const displayPrompt = `"${t.prompt.slice(0, 32)}"`.padEnd(34, ' ');
    process.stdout.write(`  [${i + 1}/${PUBLIC_FAQ_TESTS.length}] ${paddedCat} | ${displayPrompt} ... `);

    try {
      const startTime = Date.now();
      const res = await rpc('/assistant/public', { message: t.prompt });
      const latency = Date.now() - startTime;

      if (!res || !res.success) {
        throw new Error(`Public FAQ returned failure envelope: ${JSON.stringify(res)}`);
      }

      const data = res.data || {};
      const summary = data.summary || '';
      const bullets = Array.isArray(data.bullets) ? data.bullets : [];
      const links = Array.isArray(data.links) ? data.links : [];

      if (!summary.trim()) {
        throw new Error(`Empty public FAQ summary returned.`);
      }

      const allText = summary + ' ' + bullets.join(' ');
      if (t.expectedRegex && !t.expectedRegex.test(allText)) {
        throw new Error(`Public FAQ failed regex (${t.expectedRegex}). Content: "${allText}"`);
      }

      console.log(`✓ PASS (${latency}ms) [Bullets: ${bullets.length}, Links: ${links.length}]`);
      passed++;
    } catch (err) {
      console.log(`✗ FAIL`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  return { passed, failed, total: PUBLIC_FAQ_TESTS.length };
}

async function main() {
  console.log('===============================================================');
  console.log('GRIDPULSE PULSEBOT SUPER-ULTRA COMPREHENSIVE QA TEST SUITE');
  console.log('Testing Admin, Engineer, Viewer across 80+ queries end-to-end');
  console.log('===============================================================');

  const viewerTests = [...COMMON_TESTS, ...VIEWER_SPECIFIC];
  const engineerTests = [...COMMON_TESTS, ...ENGINEER_SPECIFIC];
  const adminTests = [...COMMON_TESTS, ...ADMIN_SPECIFIC];

  const viewerRes = await runTestGroup('Viewer', 'viewer@gridpulse.io', 'Viewer12345', viewerTests);
  const engineerRes = await runTestGroup('Engineer', 'engineer@gridpulse.io', 'Engineer12345', engineerTests);
  const adminRes = await runTestGroup('Admin', 'admin@gridpulse.io', 'Admin12345', adminTests);
  const publicRes = await runPublicFAQTests();

  const totalPassed = viewerRes.passed + engineerRes.passed + adminRes.passed + publicRes.passed;
  const totalFailed = viewerRes.failed + engineerRes.failed + adminRes.failed + publicRes.failed;
  const grandTotal = viewerRes.total + engineerRes.total + adminRes.total + publicRes.total;
  const pct = Math.round((totalPassed / grandTotal) * 100);

  console.log('\n===============================================================');
  console.log(`FINAL REPORT: ${totalPassed} / ${grandTotal} TESTS PASSED (${pct}%)`);
  if (totalFailed === 0) {
    console.log('PERFECT 100% PASS RATE! Zero regressions, zero empty placeholders.');
  } else {
    console.log(`ATTENTION: ${totalFailed} tests failed.`);
  }
  console.log('===============================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
