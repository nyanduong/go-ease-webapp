import {
  adminPlaceCreateSchema,
  adminPlaceUpdateSchema,
  managedPlaceSchema,
  managedCatalogSchema,
  catalogEntrySchema,
} from '@goease/contracts';
import type { ApiConfig } from '../../../config/env.js';
import { ApiFailure } from '../../../common/errors/api-failure.js';
import {
  ActorTransactionService,
  type Owner,
  type Transaction,
} from '../../../database/actor-transaction.service.js';
import { AccountIdentityService } from '../../auth/account-identity.service.js';
import { CatalogRepository } from '../catalog.repository.js';
export class AdminCatalogService {
  constructor(
    private readonly config: ApiConfig,
    private readonly identity: AccountIdentityService,
    private readonly transactions: ActorTransactionService,
    private readonly repository: CatalogRepository,
  ) {}
  private async run<T>(
    authorization: string | undefined,
    signal: AbortSignal,
    action: (tx: Transaction, owner: Owner) => Promise<T>,
  ) {
    if (!this.config.CATALOG_ADMIN_ENABLED)
      throw new ApiFailure(503, 'ADMIN_DISABLED', 'Quản lý catalog đang tắt.');
    const owner = await this.identity.verify(authorization, signal);
    return this.transactions.run(owner, signal, async (tx) => {
      if (!(await this.repository.permitted(tx, owner)))
        throw new ApiFailure(
          403,
          'ADMIN_FORBIDDEN',
          'Tài khoản chưa được server cấp quyền catalog.',
        );
      return action(tx, owner);
    });
  }
  list(authorization: string | undefined, signal: AbortSignal) {
    return this.run(authorization, signal, async (tx) =>
      managedCatalogSchema.parse({
        apiVersion: '1',
        places: (await this.repository.list(tx)).map((p) => ({
          entry: p.snapshot,
          version: p.version,
          enabled: p.enabled,
        })),
      }),
    );
  }
  createPlace(authorization: string | undefined, signal: AbortSignal, body: unknown) {
    return this.run(authorization, signal, async (tx, owner) => {
      const parsed = adminPlaceCreateSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiFailure(
          400,
          'BAD_REQUEST',
          'Place/nguồn không hợp lệ; không nhận role/owner.',
        );
      await this.repository.lock(tx);
      if ((await this.repository.count(tx)) >= 20)
        throw new ApiFailure(409, 'CATALOG_LIMIT', 'MVP tối đa 20 Place, kể cả địa điểm đã tắt.');
      if (await this.repository.find(tx, parsed.data.entry.id))
        throw new ApiFailure(409, 'CATALOG_CONFLICT', 'ID Place đã được sử dụng; không tạo lại.');
      await this.repository.create(tx, owner, parsed.data.entry);
      return managedPlaceSchema.parse({ entry: parsed.data.entry, version: 1, enabled: true });
    });
  }
  updatePlace(authorization: string | undefined, signal: AbortSignal, id: string, body: unknown) {
    return this.run(authorization, signal, async (tx, owner) => {
      const parsed = adminPlaceUpdateSchema.safeParse(body);
      if (!parsed.success || parsed.data.entry.id !== id)
        throw new ApiFailure(400, 'BAD_REQUEST', 'Nội dung, ID hoặc version Place không hợp lệ.');
      await this.repository.lock(tx);
      const current = await this.repository.find(tx, id);
      if (!current) throw new ApiFailure(404, 'NOT_FOUND', 'Không có Place này.');
      if (current.version !== parsed.data.expectedVersion || current.version === 2147483647)
        throw new ApiFailure(
          409,
          'CATALOG_CONFLICT',
          'Place đã đổi; tải lại để đối chiếu, không tự ghi đè.',
        );
      const previous = catalogEntrySchema.parse(current.snapshot),
        entry = parsed.data.entry;
      if (JSON.stringify(previous.coordinates) !== JSON.stringify(entry.coordinates))
        throw new ApiFailure(
          400,
          'BAD_REQUEST',
          'Tọa độ Place đã tạo là bất biến để giữ vị trí chuyến cũ; tạo ID mới khi cần đổi vị trí.',
        );
      if (current.enabled && !parsed.data.enabled && (await this.repository.count(tx, true)) <= 8)
        throw new ApiFailure(
          409,
          'CATALOG_LIMIT',
          'Giữ ít nhất 8 địa điểm đang hoạt động để lập lịch trình.',
        );
      const version = current.version + 1;
      await this.repository.update(tx, owner, entry, version, parsed.data.enabled);
      return managedPlaceSchema.parse({ entry, version, enabled: parsed.data.enabled });
    });
  }
}
