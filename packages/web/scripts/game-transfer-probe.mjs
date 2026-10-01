// B207-2: 공개 상태/실제 응답 계측만 한다. URL query는 내부 식별에만 사용한다.
export function gameState() {
  const doc = globalThis.document;
  const root = doc.querySelector('[data-testid="match"]');
  const board = root?.querySelector('[data-testid="board"]');
  const hand = board?.querySelectorAll('[aria-label="내 손패"] button');
  return {
    match: root !== null,
    canAct: root?.dataset.canAct === 'true',
    phase: root?.dataset.phase ?? '',
    boardBusy: board?.dataset.busy !== 'false',
    hand: hand?.length ?? 0,
    legalHandEnabled: [...(hand ?? [])].filter(
      (button) => !button.disabled && button.getClientRects().length > 0,
    ).length,
    firstPickPending:
      board?.classList.contains('first-pick') === true ||
      doc.querySelector('[data-choice^="pick-"]') !== null,
    rounds: Number(root?.dataset.roundsPlayed ?? 0),
    seq: Number(root?.dataset.seq ?? 0),
  };
}
export function firstGameReady(states) {
  return (
    states.every((s) => s.match && s.phase === 'playing' && s.hand === 10 && !s.firstPickPending) &&
    states.some((s) => s.canAct && !s.boardBusy && s.legalHandEnabled > 0)
  );
}
export function phaseEntries(entries, baseline, timeOrigin) {
  return entries.filter(
    (entry) => timeOrigin !== baseline.timeOrigin || entry.startTime >= baseline.at,
  );
}
export function bodyAccounting(entries) {
  const network = entries.filter((entry) => entry.transferSize > 0);
  const unique = new Map();
  for (const entry of network)
    unique.set(entry.urlId, Math.max(unique.get(entry.urlId) ?? 0, entry.encodedBodySize));
  return {
    networkResponseCountFromTiming: network.length,
    networkEncodedBodySizeFromTiming: network.reduce(
      (sum, entry) => sum + entry.encodedBodySize,
      0,
    ),
    networkUniqueUrlCount: unique.size,
    // 같은 URL의 관측 body가 달라지면 최대 body 1개: 전송 합과 별도인 자산 회계다.
    networkUniqueEncodedBodySizeFromTiming: [...unique.values()].reduce(
      (sum, bytes) => sum + bytes,
      0,
    ),
    cachedOrLocalCountFromTiming: entries.length - network.length,
    cachedOrLocalEncodedBodySizeFromTiming: entries
      .filter((entry) => entry.transferSize === 0)
      .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
  };
}
export async function recordTrial(report, metadata, task, partial, save) {
  const trial = { ...metadata, phase: 'setup', complete: false, failures: [] };
  report.trials.push(trial);
  try {
    trial.complete = await task(trial);
  } catch (error) {
    trial.failures.push({
      reason: 'trial-exception',
      type: error?.name === 'TimeoutError' ? 'timeout' : 'error',
    });
    try {
      await partial(trial);
    } catch {
      trial.failures.push({ reason: 'partial-collection-failed' });
    }
  } finally {
    await save();
  }
  return trial;
}
export class TransferProbe {
  constructor(page, base) {
    this.page = page;
    this.base = base;
    this.ids = new Map();
    this.records = [];
    this.phase = 'setup';
    this.baseline = { timeOrigin: -1, at: 0 };
    const requests = new WeakMap();
    this.pendingSizes = new Set();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const record = {
        ...this.identify(url.href),
        phase: this.phase,
        resourceType: request.resourceType(),
        status: null,
        finished: false,
        failure: url.origin === base.origin ? null : 'non-fixture-origin',
      };
      requests.set(request, record);
      this.records.push(record);
    });
    page.on('response', (response) => {
      const record = requests.get(response.request());
      if (!record) return;
      const headers = response.headers();
      Object.assign(record, {
        status: response.status(),
        encoding: headers['content-encoding'] ?? 'identity',
        contentLength: Number(headers['content-length'] ?? 0),
        cacheControl: headers['cache-control'] ?? '',
      });
    });
    page.on('requestfinished', (request) => {
      const record = requests.get(request);
      if (!record) return;
      record.finished = true;
      const pending = request
        .sizes()
        .then(
          (sizes) => {
            record.receivedEncodedBodySize = sizes.responseBodySize;
          },
          () => {
            record.sizeUnavailable = true;
          },
        )
        .finally(() => this.pendingSizes.delete(pending));
      this.pendingSizes.add(pending);
    });
    page.on('requestfailed', (request) => {
      const record = requests.get(request);
      if (record) Object.assign(record, { finished: true, failure: 'requestfailed' });
    });
  }
  identify(address) {
    const url = new URL(address);
    // fragment는 HTTP 요청에 전송되지 않는다. query는 그대로 식별한다.
    url.hash = '';
    address = url.href;
    if (!this.ids.has(address)) this.ids.set(address, `url-${this.ids.size + 1}`);
    return {
      urlId: this.ids.get(address),
      path:
        url.origin === this.base.origin
          ? url.pathname.replace(this.base.pathname, '')
          : 'non-fixture',
    };
  }
  async begin(phase) {
    this.phase = phase;
    this.baseline = await this.page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      at: performance.now(),
    }));
  }
  async collect(metadata, endpointReached) {
    await Promise.all([...this.pendingSizes]);
    const observed = await this.page.evaluate(async () => {
      // fonts.ready 단독은 실패 font도 resolve한다. 각 face의 상태도 확인한다.
      await Promise.race([
        globalThis.document.fonts.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('font wait')), 5000)),
      ]);
      const fontFailures = [...globalThis.document.fonts]
        .filter((font) => font.status === 'error' || font.status === 'loading')
        .map((font) => ({ reason: 'font-not-loaded', status: font.status }));
      const imageFailures = (
        await Promise.all(
          [...globalThis.document.images].map(async (image) => {
            try {
              await image.decode();
              return null;
            } catch {
              return {
                path: (image.currentSrc || image.src).startsWith('data:')
                  ? 'inline-data'
                  : new URL(image.currentSrc || image.src).pathname,
                complete: image.complete,
                width: image.naturalWidth,
              };
            }
          }),
        )
      ).filter(Boolean);
      return {
        fontFailures,
        imageFailures,
        timeOrigin: performance.timeOrigin,
        timing: [
          ...performance.getEntriesByType('navigation'),
          ...performance.getEntriesByType('resource'),
        ].map((entry) => ({
          address: entry.name,
          startTime: entry.startTime,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          transferSize: entry.transferSize,
        })),
      };
    });
    const timing = phaseEntries(observed.timing, this.baseline, observed.timeOrigin).map(
      ({ address, ...entry }) => ({
        ...entry,
        ...this.identify(address),
      }),
    );
    const responses = this.records.filter((record) => record.phase === this.phase);
    const httpFailures = responses
      .filter(
        (record) =>
          record.failure !== null ||
          !record.finished ||
          record.status === null ||
          record.status >= 400,
      )
      .map(({ urlId, path, status, failure, finished }) => ({
        urlId,
        path,
        status,
        reason: failure ?? (finished ? 'http-status' : 'request-incomplete'),
      }));
    const imageFailures = observed.imageFailures.map((entry) => ({
      ...entry,
      path: entry.path.replace(this.base.pathname, ''),
    }));
    // worker 등 timing이 없는 응답을0 B로 수용하지 않는다. 별도 server 계측이 필요하다.
    const timingCounts = new Map();
    for (const entry of timing)
      timingCounts.set(entry.urlId, (timingCounts.get(entry.urlId) ?? 0) + 1);
    let unaccountedResponses = 0;
    for (const record of responses) {
      const remaining = timingCounts.get(record.urlId) ?? 0;
      if (remaining === 0) unaccountedResponses++;
      else timingCounts.set(record.urlId, remaining - 1);
    }
    return {
      ...metadata,
      phase: this.phase,
      endpointReached,
      completeReady:
        endpointReached &&
        httpFailures.length === 0 &&
        imageFailures.length === 0 &&
        observed.fontFailures.length === 0 &&
        unaccountedResponses === 0,
      requestCount: responses.length,
      httpFailures,
      imageFailures,
      fontFailures: observed.fontFailures,
      unaccountedResponses,
      responses,
      timing,
      ...bodyAccounting(timing),
      state: await this.page.evaluate(gameState),
    };
  }
  partial(metadata) {
    const responses = this.records.filter((record) => record.phase === this.phase);
    return {
      ...metadata,
      phase: this.phase,
      completeReady: false,
      endpointReached: false,
      requestCount: responses.length,
      responses,
      failure: 'collection-unavailable',
    };
  }
}
