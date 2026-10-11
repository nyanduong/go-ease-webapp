import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  controllers: [HealthController],
})
export class AppModule {
  static async register(environment?: Record<string, unknown>): Promise<DynamicModule> {
    // Explicit configuration is validated too, but never reads/writes personal env.
    const config = environment === undefined
      ? await ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnvironment, skipProcessEnv: true })
      : await ConfigModule.forRoot({
        isGlobal: true, ignoreEnvFile: true, validatePredefined: false, skipProcessEnv: true,
        load: [() => validateEnvironment(environment)],
      });
    return { module: AppModule, imports: [config, AuthModule] };
  }
}
