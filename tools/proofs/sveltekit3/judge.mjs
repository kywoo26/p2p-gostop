export function judge(row, base) {
  const noLeaks =
    !row.outbound.length &&
    !row.errors.some((e) => e.secret) &&
    !row.records.some((r) => r.secretInRequest);
  const expectedFailure =
    row.variant === 'inline-original' ||
    (base !== '/' && ['split-original', 'single-original'].includes(row.variant));
  if (expectedFailure) {
    const signature =
      row.failure === 'TimeoutError' &&
      (row.variant === 'inline-original'
        ? row.failureMessage?.startsWith('page.waitForFunction:')
        : row.failureMessage?.startsWith('locator.waitFor:')) &&
      row.errors.length > 0 &&
      row.workers.length === 0 &&
      row.records.some(
        (r) =>
          r.status === 404 &&
          (row.variant === 'inline-original'
            ? /\/font\.[A-Za-z0-9_-]+\.woff2$/.test(r.path)
            : r.path.startsWith('/_app/immutable/')),
      );
    return {
      expected: 'FAIL',
      verdict: !row.complete && noLeaks && signature ? 'expected FAIL' : 'UNEXPECTED FAIL',
    };
  }
  let valid =
    row.complete &&
    noLeaks &&
    row.initial?.bodyVisible &&
    row.lazy?.lifetime === '1/2' &&
    row.lazy?.workerPreserved &&
    row.lazy?.extraResponses === (row.variant === 'single-original' ? 0 : 1);
  if (row.variant === 'split-relocated') {
    valid &&=
      row.tokens?.length === 2 &&
      row.tokens.every((t) => !t.history && !t.title && !t.text && !t.announcer) &&
      row.tokens[0].nestedTicket &&
      row.tokens[1].remoteScrubbed &&
      row.version?.navigations === 0 &&
      row.version.requests.some((r) => r.status === 503) &&
      row.version.requests.some((r) => r.status === 200) &&
      row.version.requests.every((r) => r.path === base + '_app/version.json');
  }
  return { expected: 'PASS', verdict: valid ? 'PASS' : 'UNEXPECTED FAIL' };
}
