import { readFileSync } from 'fs';
import { join } from 'path';

export interface EnvironmentConfig {
  name: string;
  baseUrl: string;
  apiVersion: string;
  timeout: number;
  logging: boolean;
}

export interface UserCredentials {
  username: string;
  password: string;
  email: string;
}

export function getCurrentEnv(): string {
  return process.env.NODE_ENV?.trim().toLowerCase() || 'qa';
}

export function loadEnvironmentConfig(envName: string): EnvironmentConfig {
  const filePath = join(__dirname, '../data/environments', `${envName}.json`);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as EnvironmentConfig;
}

export function loadUserCredentials(envName: string): UserCredentials {
  const filePath = join(__dirname, '../data/users/users.json');
  const raw = readFileSync(filePath, 'utf-8');
  const allUsers = JSON.parse(raw) as Record<string, UserCredentials>;
  if (!allUsers[envName]) {
    throw new Error(`No user credentials configured for environment: ${envName}`);
  }
  return allUsers[envName];
}
