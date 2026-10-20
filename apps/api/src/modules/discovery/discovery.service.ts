import { randomUUID } from 'node:crypto';
import {
  DESTINATIONS,
  destinationSearchQuerySchema,
  destinationSearchResponseSchema,
  discoveryPlacesRequestSchema,
  discoveryPlacesResponseSchema,
  discoveryPreviewRequestSchema,
  discoveryPreviewResponseSchema,
  createTripInputSchemaFor,
  getDestination,
  todayAtDestination,
  type Destination,
  type DiscoveryPlacesRequest,
  type DiscoveryPlace,
} from '@goease/contracts';
import { generateDiscoveredTrip } from '@goease/itinerary';
import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../../common/errors/api-failure.js';
import { DiscoveryQuota } from './discovery-quota.js';
import { normalizePlaces } from './normalize-places.js';
import { isVietnamCoordinate } from './vietnam-coverage.js';
import {
  normalizeDestinations,
  sameDestination,
  signDestination,
  verifyDestination,
} from './dynamic-destinations.js';

export interface DiscoveryOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
}
type CacheEntry = {
  places: DiscoveryPlace[];
  fetchedAt: string;
  warnings: string[];
  expires: number;
};
const interestQueries: Record<string, string> = {
  food: 'ẩm thực nhà hàng',
  cafe: 'quán cà phê',
  heritage: 'di tích bảo tàng',
  religious: 'chùa nhà thờ',
  nature: 'thiên nhiên',
  garden: 'vườn hoa',
  market: 'chợ',
  'public-space': 'điểm tham quan',
};

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new ApiFailure(502, 'DISCOVERY_OUTPUT_INVALID', 'Nguồn địa điểm không trả nội dung.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 2 * 1024 * 1024)
        throw new ApiFailure(
          502,
          'DISCOVERY_OUTPUT_INVALID',
          'Phản hồi nguồn địa điểm vượt giới hạn.',
        );
      chunks.push(result.value);
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as unknown;
    } catch {
      throw new ApiFailure(
        502,
        'DISCOVERY_OUTPUT_INVALID',
        'Nguồn địa điểm trả dữ liệu không hợp lệ.',
      );
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class DiscoveryService {
  private readonly quota: DiscoveryQuota;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly destinationCache = new Map<
    string,
    { destinations: Destination[]; fetchedAt: string; expires: number }
  >();
  private pending: Promise<unknown> | undefined;
  private controller: AbortController | undefined;
  private closed = false;
  constructor(
    private readonly config: ApiConfig,
    private readonly options: DiscoveryOptions = {},
  ) {
    this.quota = new DiscoveryQuota(config);
  }
  async searchDestinations(
    query: unknown,
    userId?: string,
    signal: AbortSignal = new AbortController().signal,
  ) {
    const parsed = destinationSearchQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Chỉ nhận từ khóa điểm đến tối đa 120 ký tự.');
    const q = parsed.data.q ?? '';
    if (!q)
      return destinationSearchResponseSchema.parse({
        apiVersion: '1',
        destinations: DESTINATIONS,
        source: 'suggestions',
      });
    if (q.length < 2)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Nhập ít nhất 2 ký tự để tìm điểm đến.');
    if (!userId) throw new ApiFailure(401, 'AUTH_INVALID', 'Đăng nhập để tìm điểm đến.');
    this.requireProvider();
    if (this.closed || signal.aborted)
      throw new ApiFailure(499, 'DISCOVERY_CANCELLED', 'Đã hủy tìm điểm đến.');
    const now = (this.options.now ?? (() => new Date()))(),
      started = Date.now();
    // Free text remains open across Vietnam; the independent polygon check enforces coverage.
    const key = q.normalize('NFC').toLocaleLowerCase('vi');
    const cached = this.destinationCache.get(key);
    if (cached && cached.expires > now.getTime()) {
      this.logSearchMetrics(true, 0, Date.now() - started, cached.destinations.length);
      return destinationSearchResponseSchema.parse({
        apiVersion: '1',
        destinations: cached.destinations.map((destination) =>
          signDestination(destination, this.config.SERPAPI_API_KEY),
        ),
        source: 'cache',
        metadata: {
          cacheHit: true,
          providerRequests: 0,
          durationMs: Date.now() - started,
          fetchedAt: cached.fetchedAt,
        },
      });
    }
    const url = this.providerUrl();
    url.searchParams.set('q', `${q} Việt Nam`);
    const raw = await this.requestProvider(url, userId, signal, now);
    const normalized = normalizeDestinations(raw, now.toISOString());
    if (!normalized.valid)
      throw new ApiFailure(
        502,
        'DISCOVERY_OUTPUT_INVALID',
        'Nguồn tìm điểm đến trả cấu trúc không hợp lệ.',
      );
    if (!normalized.destinations.length)
      throw new ApiFailure(
        422,
        'DISCOVERY_NO_RESULTS',
        'Chưa tìm thấy điểm đến có tọa độ được xác nhận tại Việt Nam. Hãy nhập thêm tỉnh, vùng hoặc tên địa danh ở Việt Nam.',
      );
    this.destinationCache.delete(key);
    while (this.destinationCache.size >= 50)
      this.destinationCache.delete(this.destinationCache.keys().next().value!);
    this.destinationCache.set(key, {
      destinations: normalized.destinations,
      fetchedAt: now.toISOString(),
      expires: now.getTime() + this.config.SERPAPI_CACHE_TTL_MS,
    });
    this.logSearchMetrics(false, 1, Date.now() - started, normalized.destinations.length);
    return destinationSearchResponseSchema.parse({
      apiVersion: '1',
      destinations: normalized.destinations.map((destination) =>
        signDestination(destination, this.config.SERPAPI_API_KEY),
      ),
      source: 'serpapi',
      metadata: {
        cacheHit: false,
        providerRequests: 1,
        durationMs: Date.now() - started,
        fetchedAt: now.toISOString(),
      },
    });
  }
  async places(body: unknown, userId: string, signal: AbortSignal) {
    const parsed = discoveryPlacesRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Chọn điểm đến và sở thích hợp lệ.');
    return discoveryPlacesResponseSchema.parse(await this.discover(parsed.data, userId, signal));
  }
  async preview(body: unknown, userId: string, signal: AbortSignal) {
    const parsed = discoveryPreviewRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Nhu cầu chuyến đi không hợp lệ.');
    const destination = this.requireDestination(
      parsed.data.input.destinationId,
      parsed.data.input.destination,
    );
    const now = (this.options.now ?? (() => new Date()))();
    const input = createTripInputSchemaFor(todayAtDestination(now, destination)).safeParse(
      parsed.data.input,
    );
    if (!input.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Ngày khởi hành phải từ hôm nay tại điểm đến.');
    const found = await this.discover(
      {
        destinationId: destination.id,
        destination,
        ...(parsed.data.interests ? { interests: parsed.data.interests } : {}),
      },
      userId,
      signal,
    );
    const result = generateDiscoveredTrip(input.data, found.places, {
      tripId: randomUUID(),
      today: todayAtDestination(now, destination),
      destination,
    });
    if (!result.ok) throw new ApiFailure(422, 'DISCOVERY_NO_RESULTS', result.message.slice(0, 200));
    return discoveryPreviewResponseSchema.parse({
      apiVersion: '1',
      destination,
      places: found.places,
      source: found.source,
      metadata: found.metadata,
      result: {
        ...result,
        warnings: [...new Set([...found.warnings, ...result.warnings])].slice(0, 20),
      },
    });
  }
  private requireDestination(id: string, snapshot?: Destination): Destination {
    const destination = getDestination(id);
    if (destination) {
      if (snapshot && !sameDestination(destination, snapshot))
        throw new ApiFailure(400, 'BAD_REQUEST', 'Thông tin điểm đến không khớp vùng đã xác nhận.');
      return destination;
    }
    if (
      !snapshot ||
      snapshot.id !== id ||
      snapshot.countryCode !== 'VN' ||
      !isVietnamCoordinate(snapshot.center) ||
      !verifyDestination(snapshot, this.config.SERPAPI_API_KEY)
    )
      throw new ApiFailure(
        400,
        'BAD_REQUEST',
        'Thông tin điểm đến chưa được xác nhận. Hãy tìm và chọn lại điểm đến.',
      );
    return snapshot;
  }
  private logMetrics(
    destinationId: string,
    cacheHit: boolean,
    providerRequests: number,
    durationMs: number,
    placeCount: number,
  ) {
    if (this.config.SERPAPI_LOG_METRICS)
      console.info(
        JSON.stringify({
          event: 'goease.discovery',
          destinationId,
          cacheHit,
          providerRequests,
          durationMs,
          placeCount,
        }),
      );
  }
  private logSearchMetrics(
    cacheHit: boolean,
    providerRequests: number,
    durationMs: number,
    resultCount: number,
  ) {
    if (this.config.SERPAPI_LOG_METRICS)
      console.info(
        JSON.stringify({
          event: 'goease.destination_search',
          cacheHit,
          providerRequests,
          durationMs,
          resultCount,
        }),
      );
  }
  private async discover(request: DiscoveryPlacesRequest, userId: string, signal: AbortSignal) {
    this.requireProvider();
    const destination = this.requireDestination(request.destinationId, request.destination);
    if (this.closed || signal.aborted)
      throw new ApiFailure(499, 'DISCOVERY_CANCELLED', 'Đã hủy tìm địa điểm.');
    const now = (this.options.now ?? (() => new Date()))();
    const interests = [...new Set(request.interests ?? [])].sort();
    const key = `${destination.id}:${interests.join(',')}`;
    const started = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expires > now.getTime()) {
      this.logMetrics(destination.id, true, 0, Date.now() - started, cached.places.length);
      return {
        apiVersion: '1' as const,
        destination,
        places: cached.places,
        source: 'cache' as const,
        warnings: cached.warnings,
        metadata: {
          cacheHit: true,
          providerRequests: 0,
          durationMs: Date.now() - started,
          fetchedAt: cached.fetchedAt,
          missingPrices: cached.places.length,
        },
      };
    }
    const url = this.providerUrl();
    url.searchParams.set(
      'q',
      `${interests.length ? interests.map((interest) => interestQueries[interest]).join(' ') : 'điểm tham quan du lịch'} ${destination.name}${destination.address ? ` ${destination.address}` : ''}`,
    );
    url.searchParams.set(
      'll',
      `@${destination.center.latitude},${destination.center.longitude},12z`,
    );
    const raw = await this.requestProvider(url, userId, signal, now);
    const normalized = normalizePlaces(raw, destination, now.toISOString());
    if (!normalized.valid)
      throw new ApiFailure(
        502,
        'DISCOVERY_OUTPUT_INVALID',
        'Nguồn địa điểm trả cấu trúc không hợp lệ.',
      );
    if (!normalized.places.length)
      throw new ApiFailure(
        422,
        'DISCOVERY_NO_RESULTS',
        'Chưa tìm thấy địa điểm có tọa độ hợp lệ trong vùng đã chọn. Hãy tự thêm địa điểm hoặc thử lại sau.',
      );
    const warnings = [
      'Giá vé và chi phí chưa được xác minh; mức giá từ nguồn tìm kiếm không phải số tiền của chuyến đi.',
      'Thời lượng tham quan và di chuyển là ước tính; hãy kiểm tra giờ mở cửa trước khi đi.',
      ...normalized.warnings,
    ];
    if (normalized.rejected)
      warnings.push(
        `Đã bỏ ${normalized.rejected} kết quả trùng, thiếu dữ liệu, đóng cửa hoặc ngoài vùng điểm đến.`,
      );
    const value: CacheEntry = {
      places: normalized.places,
      fetchedAt: now.toISOString(),
      warnings,
      expires: now.getTime() + this.config.SERPAPI_CACHE_TTL_MS,
    };
    this.cache.delete(key);
    while (this.cache.size >= 50) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, value);
    this.logMetrics(destination.id, false, 1, Date.now() - started, value.places.length);
    return {
      apiVersion: '1' as const,
      destination,
      places: value.places,
      source: 'serpapi' as const,
      warnings,
      metadata: {
        cacheHit: false,
        providerRequests: 1,
        durationMs: Date.now() - started,
        fetchedAt: value.fetchedAt,
        missingPrices: value.places.length,
      },
    };
  }
  private requireProvider() {
    if (!this.config.SERPAPI_ENABLED)
      throw new ApiFailure(
        503,
        'DISCOVERY_DISABLED',
        'Tìm địa điểm trực tuyến đang tắt trên máy chủ. Bạn vẫn có thể tự lập lịch.',
      );
    if (!this.config.SERPAPI_API_KEY)
      throw new ApiFailure(
        503,
        'DISCOVERY_NOT_CONFIGURED',
        'Chưa cấu hình nguồn địa điểm SerpApi trên máy chủ. Bạn vẫn có thể tự lập lịch.',
      );
  }
  private providerUrl() {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_maps');
    url.searchParams.set('type', 'search');
    url.searchParams.set('hl', 'vi');
    url.searchParams.set('gl', 'vn');
    url.searchParams.set('api_key', this.config.SERPAPI_API_KEY);
    return url;
  }
  /** Both search actions spend through one persistent reservation and concurrency guard. */
  private async requestProvider(url: URL, userId: string, signal: AbortSignal, now: Date) {
    if (this.closed || signal.aborted)
      throw new ApiFailure(499, 'DISCOVERY_CANCELLED', 'Đã hủy tìm địa điểm.');
    if (this.pending)
      throw new ApiFailure(
        409,
        'DISCOVERY_BUSY',
        'Máy chủ đang tìm địa điểm. Hãy chờ rồi thử lại.',
      );
    const controller = new AbortController();
    this.controller = controller;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    let timedOut = false,
      abort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      abort = () =>
        reject(
          new ApiFailure(
            timedOut ? 504 : 499,
            timedOut ? 'REQUEST_TIMEOUT' : 'DISCOVERY_CANCELLED',
            timedOut
              ? 'Nguồn địa điểm phản hồi quá lâu. Hãy thử lại khi cần.'
              : 'Đã hủy tìm địa điểm.',
          ),
        );
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.SERPAPI_TIMEOUT_MS);
    const work = async () => {
      await this.quota.reserve(userId, now);
      if (controller.signal.aborted)
        throw new ApiFailure(499, 'DISCOVERY_CANCELLED', 'Đã hủy tìm địa điểm.');
      const fetchAndRead = async () => {
        const response = await (this.options.fetcher ?? fetch)(url.toString(), {
          method: 'GET',
          redirect: 'error',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          if (response.status === 401 || response.status === 403)
            throw new ApiFailure(
              503,
              'DISCOVERY_UPSTREAM_DENIED',
              'Nguồn địa điểm từ chối cấu hình hoặc quyền truy cập.',
            );
          if (response.status === 429)
            throw new ApiFailure(
              429,
              'DISCOVERY_RATE_LIMITED',
              'Nguồn địa điểm đã đạt giới hạn. Hãy thử lại sau.',
            );
          throw new ApiFailure(
            502,
            'DISCOVERY_UPSTREAM_UNAVAILABLE',
            'Nguồn địa điểm chưa đáp ứng. Hãy thử lại sau.',
          );
        }
        return boundedJson(response);
      };
      const raw = await Promise.race([fetchAndRead(), interrupted]);
      if (controller.signal.aborted)
        throw new ApiFailure(499, 'DISCOVERY_CANCELLED', 'Đã hủy tìm địa điểm.');
      if (raw && typeof raw === 'object' && 'error' in raw)
        throw new ApiFailure(
          502,
          'DISCOVERY_UPSTREAM_UNAVAILABLE',
          'Nguồn địa điểm chưa trả kết quả. Hãy thử lại sau.',
        );
      return raw;
    };
    const operation = work().catch((error: unknown) => {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(
        502,
        'DISCOVERY_UPSTREAM_UNAVAILABLE',
        'Chưa kết nối được nguồn địa điểm. Hãy thử lại sau.',
      );
    });
    this.pending = operation
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        if (abort) controller.signal.removeEventListener('abort', abort);
        controller.abort();
        this.controller = undefined;
        this.pending = undefined;
      });
    return Promise.race([operation, interrupted]);
  }
  async onModuleDestroy() {
    this.closed = true;
    this.controller?.abort();
    await this.pending;
    await this.quota.close().catch(() => {});
  }
}
