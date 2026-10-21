import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { API_CONFIG } from '../../config/config.module.js';
import type { ApiConfig } from '../../config/env.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthVerifier } from '../auth/auth-verifier.service.js';
import { requestSignal } from '../../common/http/request-signal.js';
import { ApiFailure } from '../../common/errors/api-failure.js';
import {
  assetId,
  inspectProfileUploads,
  trackProfileUpload,
  PROFILE_MEDIA_FILE_LIMIT,
  PROFILE_MEDIA_BYTE_LIMIT,
} from './profile-media-storage.js';

const uploadSchema = z.strictObject({
  jpeg: z
    .string()
    .min(16)
    .max(245760)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

// Inspect JPEG dimensions without decompressing user-controlled pixels.
export function validateProfileJpeg(bytes: Buffer) {
  if (
    bytes.length > 184320 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return false;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker!)) {
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      return length >= 8 && width > 0 && height > 0 && width <= 1600 && height <= 1600;
    }
    offset += length;
  }
  return false;
}

@Controller('v1/profile-media')
export class ProfileMediaController {
  private readonly pending = new Set<string>();
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(AuthVerifier) private readonly auth: AuthVerifier,
  ) {}
  @Post()
  async upload(@Req() req: Request, @Body() body: unknown) {
    const signal = requestSignal(req);
    const { response: verified, userMetadata } = await this.auth.verifyProfileMedia(
      req.headers.authorization,
      {},
      signal,
    );
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiFailure(400, 'BAD_REQUEST', 'Chọn ảnh JPG, PNG hoặc WebP hợp lệ.');
    const bytes = Buffer.from(parsed.data.jpeg, 'base64');
    if (!validateProfileJpeg(bytes))
      throw new ApiFailure(400, 'BAD_REQUEST', 'Ảnh chưa được tối ưu hợp lệ. Hãy chọn lại ảnh.');
    const owner = createHash('sha256')
      .update(this.config.SUPABASE_AUTH_URL + ':' + verified.identity.id)
      .digest('hex')
      .slice(0, 24);
    if (this.pending.has(owner))
      throw new ApiFailure(409, 'AUTH_BUSY', 'Đang tải ảnh khác lên. Hãy chờ một chút.');
    this.pending.add(owner);
    try {
      const folder = resolve(this.config.PROFILE_MEDIA_DIR);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const usage = await inspectProfileUploads(folder, owner, userMetadata, false);
      if (
        usage.files >= PROFILE_MEDIA_FILE_LIMIT ||
        usage.bytes + bytes.length > PROFILE_MEDIA_BYTE_LIMIT
      )
        throw new ApiFailure(429, 'TRIP_LIMIT', 'Kho ảnh tài khoản đã đầy. Hãy liên hệ hỗ trợ.');
      if (signal.aborted) throw new ApiFailure(499, 'AUTH_CANCELLED', 'Đã dừng tải ảnh.');
      const id = owner + '-' + randomUUID() + '.jpg';
      await writeFile(join(folder, id), bytes, { flag: 'wx', mode: 0o600 });
      try {
        await trackProfileUpload(folder, id);
        if (signal.aborted) throw new ApiFailure(499, 'AUTH_CANCELLED', 'Đã dừng tải ảnh.');
      } catch (error) {
        // Roll back only this request's newly created, never returned asset.
        await unlink(join(folder, id));
        await unlink(join(folder, id + '.pending.json')).catch(() => {});
        throw error;
      }
      return { apiVersion: '1', path: '/v1/profile-media/' + id };
    } finally {
      this.pending.delete(owner);
    }
  }
  @Post('cleanup')
  async cleanup(@Req() req: Request, @Body() body: unknown) {
    const parsed = z.strictObject({ dryRun: z.boolean().default(true) }).safeParse(body);
    if (!parsed.success) throw new ApiFailure(400, 'BAD_REQUEST', 'Yêu cầu dọn ảnh không hợp lệ.');
    const signal = requestSignal(req);
    const { response, userMetadata } = await this.auth.verifyProfileMedia(
      req.headers.authorization,
      {},
      signal,
    );
    const owner = createHash('sha256')
      .update(this.config.SUPABASE_AUTH_URL + ':' + response.identity.id)
      .digest('hex')
      .slice(0, 24);
    if (this.pending.has(owner))
      throw new ApiFailure(409, 'AUTH_BUSY', 'Đang tải ảnh khác lên. Hãy chờ một chút.');
    this.pending.add(owner);
    try {
      if (signal.aborted) throw new ApiFailure(499, 'AUTH_CANCELLED', 'Đã dừng dọn ảnh.');
      return {
        apiVersion: '1',
        ...(await inspectProfileUploads(
          resolve(this.config.PROFILE_MEDIA_DIR),
          owner,
          userMetadata,
          parsed.data.dryRun,
        )),
      };
    } finally {
      this.pending.delete(owner);
    }
  }
  @Get(':id')
  async image(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    if (!assetId.test(id)) throw new ApiFailure(404, 'NOT_FOUND', 'Không có ảnh này.');
    let bytes: Buffer;
    try {
      bytes = await readFile(join(resolve(this.config.PROFILE_MEDIA_DIR), id));
    } catch {
      throw new ApiFailure(404, 'NOT_FOUND', 'Không có ảnh này.');
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes, { type: 'image/jpeg' });
  }
}

@Module({ imports: [AuthModule], controllers: [ProfileMediaController] })
export class ProfileMediaModule {}
