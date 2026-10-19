import { Prisma } from '../generated/prisma/client.js';
import type { ApiConfig } from '../config/env.js';
import { ApiFailure } from '../common/errors/api-failure.js';
import { PrismaService } from './prisma.service.js';
export type Owner = { ownerIssuer: string; ownerSubject: string };
export type Transaction = Prisma.TransactionClient;
export function assertTransactionActive(signal: AbortSignal) {
  if (signal.aborted)
    throw new ApiFailure(
      499,
      'TRIPS_CANCELLED',
      'Đã hủy thao tác. Nếu mất phản hồi, đối soát bằng mutationId cũ.',
    );
}
export class ActorTransactionService {
  constructor(
    private readonly config: ApiConfig,
    private readonly database: PrismaService,
  ) {}
  async run<T>(
    owner: Owner,
    signal: AbortSignal,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      assertTransactionActive(signal);
      return await this.database.requireClient().$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('goease.issuer',${owner.ownerIssuer},true), set_config('goease.subject',${owner.ownerSubject},true)`;
          assertTransactionActive(signal);
          const result = await action(tx);
          assertTransactionActive(signal);
          return result;
        },
        {
          maxWait: 1000,
          timeout: this.config.TRIPS_DB_TIMEOUT_MS,
          isolationLevel: 'ReadCommitted',
        },
      );
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ApiFailure(409, 'TRIP_CONFLICT', 'Chuyến đã thay đổi; đọc lại trước khi sửa.');
      throw new ApiFailure(
        503,
        'DB_UNAVAILABLE',
        'Chưa xác nhận ghi server. Giữ nội dung/mutationId để đối soát, không tự ghi đè hoặc tạo ID mới.',
      );
    }
  }
}
