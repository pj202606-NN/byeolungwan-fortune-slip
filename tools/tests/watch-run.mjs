const sha = process.argv[2];
const H = { Accept: 'application/vnd.github+json' };
if (process.env.GH_TOKEN) H.Authorization = `Bearer ${process.env.GH_TOKEN}`;
const API = 'https://api.github.com/repos/pj202606-NN/byeolungwan-fortune-slip';
const deadline = Date.now() + 8 * 60e3; let last = '';
while (Date.now() < deadline) {
  const response = await fetch(`${API}/actions/runs?head_sha=${sha}`, { headers: H });
  if (!response.ok) throw new Error(`Actions 조회 실패: HTTP ${response.status}`);
  const runs = await response.json();
  const run = runs.workflow_runs && runs.workflow_runs[0];
  const line = run ? `${run.name}: ${run.status} ${run.conclusion || ''}` : '실행 대기 중';
  if (line !== last) { console.log(new Date().toLocaleTimeString('ko-KR'), line); last = line; }
  if (run && run.status === 'completed') {
    const jobs = await (await fetch(run.jobs_url, { headers: H })).json();
    for (const job of jobs.jobs) for (const s of job.steps) console.log(`  - ${s.name}: ${s.conclusion}`);
    console.log('run url:', run.html_url); process.exit(run.conclusion === 'success' ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 10000));
}
console.log('시간 초과'); process.exit(2);
