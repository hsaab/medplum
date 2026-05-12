#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const defaultPostgresPort = 5432;
const defaultRedisPort = 6379;
const children = new Set();
let activeProcess;
let shuttingDown = false;
let serverConfigName = 'file:medplum.config.json';
let tempServerConfigDir;
let localDevEmail = 'admin@example.com';
let localDevPassword = 'medplum_admin';

function log(message) {
  console.log(`[dev-stack] ${message}`);
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function getDockerComposeCommand() {
  const dockerCompose = spawnSync('docker', ['compose', 'version'], { cwd: rootDir, stdio: 'ignore' });
  if (dockerCompose.status === 0) {
    return { command: 'docker', args: ['compose'] };
  }

  const legacyDockerCompose = spawnSync('docker-compose', ['version'], { cwd: rootDir, stdio: 'ignore' });
  if (legacyDockerCompose.status === 0) {
    return { command: 'docker-compose', args: [] };
  }

  throw new Error('Docker Compose is required. Install Docker Desktop, then try again.');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      ...options,
    });
    activeProcess = child;

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (activeProcess === child) {
        activeProcess = undefined;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${signal ?? code}`));
    });
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(open) {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open);
    }

    socket.setTimeout(1_000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function waitForPort(host, port, label, timeoutMs = 60_000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    function tryConnect() {
      const socket = net.createConnection({ host, port });

      socket.once('connect', () => {
        socket.end();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${label} on ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 1_000);
      });
    }

    tryConnect();
  });
}

function getComposeServicePort(compose, service, internalPort) {
  const result = spawnSync(compose.command, [...compose.args, 'port', service, String(internalPort)], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0) {
    return undefined;
  }

  const line = result.stdout.trim().split('\n').pop();
  const match = line?.match(/:(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

async function chooseHostPort(compose, service, internalPort, preferredPort) {
  const runningComposePort = getComposeServicePort(compose, service, internalPort);
  if (runningComposePort) {
    return runningComposePort;
  }

  for (let port = preferredPort; port < preferredPort + 100; port++) {
    if (!(await isPortOpen(port))) {
      return port;
    }
  }

  throw new Error(`Could not find an available host port for ${service}`);
}

function createServerConfig(postgresPort, redisPort) {
  const configPath = path.join(rootDir, 'packages/server/medplum.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  localDevEmail = config.defaultSuperAdminEmail ?? localDevEmail;
  localDevPassword = config.defaultSuperAdminPassword ?? localDevPassword;

  config.database = {
    ...config.database,
    host: 'localhost',
    port: postgresPort,
  };
  config.redis = {
    ...config.redis,
    host: 'localhost',
    port: redisPort,
    password: 'medplum',
  };

  tempServerConfigDir = mkdtempSync(path.join(tmpdir(), 'medplum-dev-stack-'));
  const tempConfigPath = path.join(tempServerConfigDir, 'medplum.config.json');
  writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));
  return `file:${tempConfigPath}`;
}

async function startBackgroundServices() {
  const compose = getDockerComposeCommand();
  const postgresPort = await chooseHostPort(compose, 'postgres', 5432, defaultPostgresPort);
  const redisPort = await chooseHostPort(compose, 'redis', 6379, defaultRedisPort);
  const env = {
    ...process.env,
    MEDPLUM_POSTGRES_PORT: String(postgresPort),
    MEDPLUM_REDIS_PORT: String(redisPort),
  };

  if (postgresPort !== defaultPostgresPort) {
    log(`PostgreSQL port ${defaultPostgresPort} is busy; using Docker PostgreSQL on ${postgresPort}.`);
  }
  if (redisPort !== defaultRedisPort) {
    log(`Redis port ${defaultRedisPort} is busy; using Docker Redis on ${redisPort}.`);
  }

  log('Starting PostgreSQL and Redis with Docker Compose...');
  await run(compose.command, [...compose.args, 'up', '-d', 'postgres', 'redis'], { env });

  log('Waiting for PostgreSQL and Redis...');
  await Promise.all([
    waitForPort(host, postgresPort, 'PostgreSQL'),
    waitForPort(host, redisPort, 'Redis'),
  ]);

  serverConfigName = createServerConfig(postgresPort, redisPort);
}

function startDevServer(name, cwd, args = [], env = process.env) {
  const child = spawn(getNpmCommand(), ['run', 'dev', ...args], {
    cwd,
    env,
    stdio: 'inherit',
  });

  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      shuttingDown = true;
      stopDevServers();
      process.exitCode = code ?? (signal ? 1 : 0);
      log(`${name} exited with ${signal ?? code}`);
    }
  });
}

function stopDevServers() {
  activeProcess?.kill('SIGTERM');
  for (const child of children) {
    child.kill('SIGTERM');
  }
  if (tempServerConfigDir) {
    rmSync(tempServerConfigDir, { force: true, recursive: true });
    tempServerConfigDir = undefined;
  }
}

async function main() {
  const npm = getNpmCommand();

  await startBackgroundServices();

  if (!existsSync(path.join(rootDir, 'node_modules'))) {
    log('Installing npm dependencies...');
    await run(npm, ['ci']);
  }

  log('Building app and server packages...');
  await run(npm, ['run', 'build:fast']);

  log('Starting Medplum API server and web app...');
  startDevServer('server', path.join(rootDir, 'packages/server'), ['--', serverConfigName]);
  startDevServer('app', path.join(rootDir, 'packages/app'));

  log('API: http://localhost:8103/healthcheck');
  log('App: http://localhost:3000/');
  log(`Local dev login email: ${localDevEmail}`);
  log(`Local dev login password: ${localDevPassword}`);
  log('Press Ctrl+C to stop the dev servers. Docker services will keep running.');
}

process.on('SIGINT', () => {
  shuttingDown = true;
  log('Stopping dev stack...');
  stopDevServers();
  if (!activeProcess && children.size === 0) {
    process.exit(130);
  }
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  stopDevServers();
});

main().catch((err) => {
  console.error(`[dev-stack] ${err.message}`);
  stopDevServers();
  process.exitCode = 1;
});
