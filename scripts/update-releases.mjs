import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = path.join(rootDir, 'projects.json');
const releasesPath = path.join(rootDir, 'releases.json');

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

function releaseReposFromProjects(projects) {
  const repos = new Set();

  for (const project of projects) {
    if (project && typeof project.releaseRepo === 'string' && project.releaseRepo.trim()) {
      repos.add(project.releaseRepo.trim());
    }
  }

  return Array.from(repos);
}

function isReleaseSnapshot(value) {
  return Boolean(
    value &&
    typeof value.tagName === 'string' &&
    value.tagName.length > 0 &&
    typeof value.url === 'string' &&
    value.url.length > 0
  );
}

function isSameReleaseSnapshot(current, next) {
  return Boolean(
    isReleaseSnapshot(current) &&
    current.tagName === next.tagName &&
    current.url === next.url
  );
}

async function fetchLatestRelease(repo) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'caocaochan-github-io-release-updater',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const release = await response.json();
  if (!release || typeof release.tag_name !== 'string' || release.tag_name.length === 0) {
    throw new Error('Invalid release format');
  }

  return {
    tagName: release.tag_name,
    url: typeof release.html_url === 'string' && release.html_url.length > 0
      ? release.html_url
      : `https://github.com/${repo}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    fetchedAt: new Date().toISOString()
  };
}

async function main() {
  const projects = await readJson(projectsPath, []);
  if (!Array.isArray(projects)) {
    throw new Error('projects.json must contain an array');
  }

  const previousReleases = await readJson(releasesPath, {});
  const nextReleases = {};

  for (const repo of releaseReposFromProjects(projects)) {
    try {
      const release = await fetchLatestRelease(repo);
      nextReleases[repo] = isSameReleaseSnapshot(previousReleases[repo], release)
        ? previousReleases[repo]
        : release;
      console.log(`Updated ${repo}: ${nextReleases[repo].tagName}`);
    } catch (error) {
      if (isReleaseSnapshot(previousReleases[repo])) {
        nextReleases[repo] = previousReleases[repo];
        console.warn(`Kept previous release for ${repo}: ${error.message}`);
      } else {
        console.warn(`No release snapshot available for ${repo}: ${error.message}`);
      }
    }
  }

  await writeFile(releasesPath, `${JSON.stringify(nextReleases, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
