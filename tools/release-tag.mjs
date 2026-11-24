#!/usr/bin/env node
/**
 * 发布 tag 前的本地校验与打 tag。
 *
 * 只在发版者本机运行：确认当前检出就是 origin/master 的最新提交、工作区干净、
 * package.json 版本与 CHANGELOG 条目一致，新 tag 高于已有 tag，且落在 master 历史上。
 *
 *   node tools/release-tag.mjs v1.0.0
 *
 * 脚本不会推送，推送由发版者检查后执行 `git push origin v1.0.0`。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * tag 格式、与 package.json 的一致性、以及 CHANGELOG 条目。
 * 格式不成立时不另报由该 tag 拼出来的条目名。
 */
export function identityProblems(tag, version, changelog) {
  const problems = [];
  if (!TAG_PATTERN.test(tag)) {
    problems.push(`tag 必须是 vX.Y.Z 或 vX.Y.Z-预发布，收到：${tag}`);
  }
  if (tag !== `v${version}`) {
    problems.push(`tag ${tag} 与 package.json 版本 v${version} 不一致。`);
  }
  if (TAG_PATTERN.test(tag) && !changelog.includes(`## [${tag.slice(1)}]`)) {
    problems.push(`CHANGELOG.md 缺少 [${tag.slice(1)}] 条目。`);
  }
  return problems;
}

const run = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** 只用于比较主线版本高低；预发布仅在重名检查中参与。 */
function semverOrder(version) {
  const match = TAG_PATTERN.exec(version);
  if (!match) throw new Error(`tag 必须是 vX.Y.Z 或 vX.Y.Z-预发布，收到：${version}`);
  return Number(match[1]) * 1e6 + Number(match[2]) * 1e3 + Number(match[3]);
}

function main() {
  const tag = process.argv[2];
  if (!tag) {
    console.error('用法：node tools/release-tag.mjs v1.0.0');
    process.exit(1);
  }

  const problems = [];
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const changelog = readFileSync('CHANGELOG.md', 'utf8');

  if (run(['branch', '--show-current']) !== 'master') {
    problems.push('当前不在 master 分支，请用发版 worktree 检出 master 后重试。');
  }
  if (run(['status', '--porcelain'])) {
    problems.push('工作区有未提交改动，先提交或清理再发版。');
  }
  if (run(['rev-parse', 'HEAD']) !== run(['rev-parse', 'origin/master'])) {
    problems.push('本地 master 与 origin/master 不一致，先 git pull --ff-only。');
  }
  problems.push(...identityProblems(tag, version, changelog));

  const existing = run(['tag', '--list', 'v*']).split('\n').filter(Boolean);
  if (existing.includes(tag)) {
    problems.push(`tag ${tag} 已存在，发布过的版本不重复打 tag。`);
  }
  if (!problems.length) {
    const previous = existing
      .filter((name) => TAG_PATTERN.test(name))
      .sort((a, b) => semverOrder(a) - semverOrder(b))
      .at(-1);
    if (previous && semverOrder(tag) <= semverOrder(previous)) {
      problems.push(`新 tag ${tag} 必须高于最近的 ${previous}。`);
    }
  }

  if (problems.length) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exit(1);
  }

  run(['tag', '-a', tag, '-m', tag, '-m', `Sea Resume ${tag}`]);
  console.log(`✓ 已创建附注标签 ${tag}，指向 ${run(['rev-parse', '--short', 'HEAD'])}（= origin/master）`);
  console.log(`  检查后推送：git push origin ${tag}`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
