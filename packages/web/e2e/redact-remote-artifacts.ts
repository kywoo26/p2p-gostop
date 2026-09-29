// RP-07: Playwright가 후처리 훅 뒤에 만드는 오류 컨텍스트에서 원격 자격을 가린다.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type {
  Reporter,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer [REDACTED]')
    .replace(/#\/join[^\s"'<>]*/g, '[REDACTED FRAGMENT]')
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, '[REDACTED]');
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  return value;
}

function redactError(error: TestError): void {
  if (error.message) error.message = redact(error.message);
  if (error.stack) error.stack = redact(error.stack);
  if (error.snippet) error.snippet = redact(error.snippet);
  if (error.value) error.value = redact(error.value);
  if (error.cause) redactError(error.cause);
}

function redactStep(step: TestStep): void {
  step.title = redact(step.title);
  if (step.subtitle) step.subtitle = redact(step.subtitle);
  if (step.params) step.params = redactValue(step.params) as typeof step.params;
  if (step.error) redactError(step.error);
  for (const child of step.steps) redactStep(child);
}

export default class RedactRemoteArtifacts implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    if (basename(test.location.file) !== 'remote-play.spec.ts') return;
    for (const error of result.errors) redactError(error);
    for (const step of result.steps) redactStep(step);
    for (const stream of [result.stdout, result.stderr])
      for (let index = 0; index < stream.length; index++) {
        const chunk = stream[index];
        if (chunk)
          stream[index] = Buffer.isBuffer(chunk)
            ? Buffer.from(redact(chunk.toString()))
            : redact(chunk);
      }
    for (const attachment of result.attachments) {
      if (
        !attachment.contentType.startsWith('text/') &&
        attachment.contentType !== 'application/json'
      )
        continue;
      if (attachment.body) attachment.body = Buffer.from(redact(attachment.body.toString('utf8')));
      if (!attachment.path) continue;
      const original = readFileSync(attachment.path, 'utf8');
      const sanitized = redact(original);
      if (sanitized !== original) writeFileSync(attachment.path, sanitized, 'utf8');
    }
  }
}
