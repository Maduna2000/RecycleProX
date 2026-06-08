#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const bundledModulesPath = path.join(root, 'node_modules', 'expo', 'bundledNativeModules.json');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(packageJsonPath)) {
  fail('package.json was not found. Run this script from the mobile app directory.');
  process.exit();
}

if (!fs.existsSync(bundledModulesPath)) {
  fail('Expo bundledNativeModules.json was not found. Run npm install before this check.');
  process.exit();
}

const packageJson = require(packageJsonPath);
const bundledModules = require(bundledModulesPath);
const dependencies = packageJson.dependencies || {};

const mismatches = [];

for (const [name, requestedRange] of Object.entries(dependencies)) {
  const expoRange = bundledModules[name];

  if (!expoRange) continue;

  const minimumRequested = semver.minVersion(requestedRange);

  if (!minimumRequested || !semver.satisfies(minimumRequested, expoRange, { includePrerelease: true })) {
    mismatches.push({ name, requestedRange, expoRange });
  }
}

if (mismatches.length > 0) {
  console.error('Expo SDK dependency version mismatches found:');
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch.name}: package.json has ${mismatch.requestedRange}, Expo SDK expects ${mismatch.expoRange}`);
  }
  console.error('\nFix with: npx expo install --fix');
  process.exit(1);
}

console.log('Expo SDK dependency versions match bundled native module ranges.');
